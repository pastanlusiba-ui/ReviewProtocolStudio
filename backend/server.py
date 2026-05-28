#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / ".data"
DB_PATH = DATA_DIR / "review_protocol_studio.sqlite3"
SESSION_DAYS = 14


def now_iso() -> str:
  return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
  DATA_DIR.mkdir(exist_ok=True)
  conn = sqlite3.connect(DB_PATH)
  conn.row_factory = sqlite3.Row
  conn.execute("PRAGMA foreign_keys = ON")
  return conn


def init_db() -> None:
  with connect() as conn:
    conn.executescript(
      """
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        institution TEXT NOT NULL,
        title TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      """
    )


def normalize_email(value: str) -> str:
  return (value or "").strip().lower()


def user_json(row: sqlite3.Row) -> dict:
  return {
    "id": row["id"],
    "firstName": row["first_name"],
    "lastName": row["last_name"],
    "institution": row["institution"],
    "title": row["title"],
    "email": row["email"],
    "name": f"{row['first_name']} {row['last_name']}".strip(),
    "createdAt": row["created_at"],
  }


def password_hash(password: str, salt: str) -> str:
  digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 210_000)
  return base64.b64encode(digest).decode("ascii")


def token_hash(token: str) -> str:
  return hashlib.sha256(token.encode("utf-8")).hexdigest()


def validate_password(password: str, confirm: str, profile: dict) -> str:
  if password != confirm:
    return "Passwords do not match"
  if len(password) < 12:
    return "Password must be at least 12 characters"
  checks = [
    (any(c.isupper() for c in password), "Password needs an uppercase letter"),
    (any(c.islower() for c in password), "Password needs a lowercase letter"),
    (any(c.isdigit() for c in password), "Password needs a number"),
    (any(not c.isalnum() for c in password), "Password needs a symbol"),
  ]
  for passed, message in checks:
    if not passed:
      return message
  lower = password.lower()
  forbidden = [
    "password",
    "reviewprotocol",
    "protocolstudio",
    normalize_email(profile.get("email", "")).split("@")[0],
    profile.get("firstName", ""),
    profile.get("lastName", ""),
    profile.get("institution", ""),
  ]
  if any(part and len(part.strip()) >= 4 and part.strip().lower() in lower for part in forbidden):
    return "Password should not include your name, institution, email, or common words"
  return ""


def create_session(conn: sqlite3.Connection, account_id: str) -> str:
  token = secrets.token_urlsafe(32)
  expires_at = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
  conn.execute(
    "INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    (token_hash(token), account_id, expires_at, now_iso()),
  )
  return token


class Handler(SimpleHTTPRequestHandler):
  def __init__(self, *args, **kwargs):
    super().__init__(*args, directory=str(ROOT), **kwargs)

  def end_headers(self):
    self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
    super().end_headers()

  def do_OPTIONS(self):
    self.send_response(HTTPStatus.NO_CONTENT)
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    self.end_headers()

  def do_GET(self):
    path = urlparse(self.path).path
    if not path.startswith("/api/"):
      return super().do_GET()
    if path == "/api/health":
      return self.json_response({"ok": True})
    if path == "/api/me":
      account = self.require_account()
      if account:
        return self.json_response({"user": user_json(account)})
      return
    if path == "/api/projects":
      account = self.require_account()
      if not account:
        return
      with connect() as conn:
        rows = conn.execute(
          "SELECT data FROM projects WHERE account_id = ? ORDER BY updated_at DESC",
          (account["id"],),
        ).fetchall()
      return self.json_response([json.loads(row["data"]) for row in rows])
    return self.error_response(HTTPStatus.NOT_FOUND, "Endpoint not found")

  def do_POST(self):
    path = urlparse(self.path).path
    if path == "/api/accounts":
      return self.create_account()
    if path == "/api/sessions":
      return self.create_login_session()
    if path == "/api/sessions/logout":
      return self.logout_session()
    if path == "/api/projects":
      return self.create_project()
    return self.error_response(HTTPStatus.NOT_FOUND, "Endpoint not found")

  def do_PUT(self):
    path = urlparse(self.path).path
    if path == "/api/me":
      return self.update_account()
    if path.startswith("/api/projects/"):
      return self.update_project(unquote(path.rsplit("/", 1)[-1]))
    return self.error_response(HTTPStatus.NOT_FOUND, "Endpoint not found")

  def do_DELETE(self):
    path = urlparse(self.path).path
    if path.startswith("/api/projects/"):
      return self.delete_project(unquote(path.rsplit("/", 1)[-1]))
    return self.error_response(HTTPStatus.NOT_FOUND, "Endpoint not found")

  def read_json(self) -> dict:
    length = int(self.headers.get("Content-Length", "0"))
    if length == 0:
      return {}
    return json.loads(self.rfile.read(length).decode("utf-8"))

  def json_response(self, payload, status=HTTPStatus.OK):
    data = json.dumps(payload).encode("utf-8")
    self.send_response(status)
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)

  def error_response(self, status: HTTPStatus, message: str):
    self.json_response({"error": message}, status)

  def require_account(self):
    header = self.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
      self.error_response(HTTPStatus.UNAUTHORIZED, "Sign in required")
      return None
    token = header.removeprefix("Bearer ").strip()
    with connect() as conn:
      row = conn.execute(
        """
        SELECT accounts.*
        FROM sessions
        JOIN accounts ON accounts.id = sessions.account_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
        """,
        (token_hash(token), now_iso()),
      ).fetchone()
    if not row:
      self.error_response(HTTPStatus.UNAUTHORIZED, "Session expired")
      return None
    return row

  def create_account(self):
    payload = self.read_json()
    required = ["firstName", "lastName", "institution", "title", "email", "password", "confirmPassword"]
    if any(not str(payload.get(field, "")).strip() for field in required):
      return self.error_response(HTTPStatus.BAD_REQUEST, "All account fields are required")
    email = normalize_email(payload["email"])
    password_error = validate_password(payload["password"], payload["confirmPassword"], { **payload, "email": email })
    if password_error:
      return self.error_response(HTTPStatus.BAD_REQUEST, password_error)
    salt = secrets.token_urlsafe(16)
    account_id = secrets.token_urlsafe(16)
    with connect() as conn:
      try:
        conn.execute(
          """
          INSERT INTO accounts
          (id, first_name, last_name, institution, title, email, password_salt, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          (
            account_id,
            payload["firstName"].strip(),
            payload["lastName"].strip(),
            payload["institution"].strip(),
            payload["title"].strip(),
            email,
            salt,
            password_hash(payload["password"], salt),
            now_iso(),
          ),
        )
      except sqlite3.IntegrityError:
        return self.error_response(HTTPStatus.CONFLICT, "Account already exists")
      token = create_session(conn, account_id)
      account = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return self.json_response({"token": token, "user": user_json(account)}, HTTPStatus.CREATED)

  def create_login_session(self):
    payload = self.read_json()
    email = normalize_email(payload.get("email", ""))
    with connect() as conn:
      account = conn.execute("SELECT * FROM accounts WHERE email = ?", (email,)).fetchone()
      if not account:
        return self.error_response(HTTPStatus.UNAUTHORIZED, "Account not found")
      expected = password_hash(payload.get("password", ""), account["password_salt"])
      if not hmac.compare_digest(expected, account["password_hash"]):
        return self.error_response(HTTPStatus.UNAUTHORIZED, "Incorrect password")
      token = create_session(conn, account["id"])
    return self.json_response({"token": token, "user": user_json(account)})

  def logout_session(self):
    header = self.headers.get("Authorization", "")
    if header.startswith("Bearer "):
      token = header.removeprefix("Bearer ").strip()
      with connect() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
    return self.json_response({"ok": True})

  def update_account(self):
    account = self.require_account()
    if not account:
      return
    payload = self.read_json()
    required = ["firstName", "lastName", "institution", "title", "email"]
    if any(not str(payload.get(field, "")).strip() for field in required):
      return self.error_response(HTTPStatus.BAD_REQUEST, "All profile fields are required")
    email = normalize_email(payload["email"])
    with connect() as conn:
      existing = conn.execute(
        "SELECT id FROM accounts WHERE email = ? AND id != ?",
        (email, account["id"]),
      ).fetchone()
      if existing:
        return self.error_response(HTTPStatus.CONFLICT, "Email is already in use")
      conn.execute(
        """
        UPDATE accounts
        SET first_name = ?, last_name = ?, institution = ?, title = ?, email = ?
        WHERE id = ?
        """,
        (
          payload["firstName"].strip(),
          payload["lastName"].strip(),
          payload["institution"].strip(),
          payload["title"].strip(),
          email,
          account["id"],
        ),
      )
      updated = conn.execute("SELECT * FROM accounts WHERE id = ?", (account["id"],)).fetchone()
    return self.json_response({"user": user_json(updated)})

  def create_project(self):
    account = self.require_account()
    if not account:
      return
    project = self.read_json()
    project["ownerId"] = account["id"]
    project.setdefault("id", secrets.token_urlsafe(16))
    project.setdefault("updatedAt", now_iso())
    with connect() as conn:
      conn.execute(
        "INSERT OR REPLACE INTO projects (id, account_id, data, updated_at) VALUES (?, ?, ?, ?)",
        (project["id"], account["id"], json.dumps(project), project.get("updatedAt") or now_iso()),
      )
    return self.json_response(project, HTTPStatus.CREATED)

  def update_project(self, project_id: str):
    account = self.require_account()
    if not account:
      return
    project = self.read_json()
    project["id"] = project_id
    project["ownerId"] = account["id"]
    project.setdefault("updatedAt", now_iso())
    with connect() as conn:
      row = conn.execute(
        "SELECT id FROM projects WHERE id = ? AND account_id = ?",
        (project_id, account["id"]),
      ).fetchone()
      if not row:
        return self.error_response(HTTPStatus.NOT_FOUND, "Project not found")
      conn.execute(
        "UPDATE projects SET data = ?, updated_at = ? WHERE id = ? AND account_id = ?",
        (json.dumps(project), project.get("updatedAt") or now_iso(), project_id, account["id"]),
      )
    return self.json_response(project)

  def delete_project(self, project_id: str):
    account = self.require_account()
    if not account:
      return
    with connect() as conn:
      conn.execute("DELETE FROM projects WHERE id = ? AND account_id = ?", (project_id, account["id"]))
    return self.json_response({"ok": True})


def main() -> None:
  init_db()
  port = int(os.environ.get("PORT", "8093"))
  server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
  print(f"Review Protocol Studio running at http://127.0.0.1:{port}/")
  server.serve_forever()


if __name__ == "__main__":
  main()
