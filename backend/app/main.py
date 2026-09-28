from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from app.db import Base, engine
from app.config import settings
from app.seed import seed_demo
from app.api.core import router
from app import auth

def apply_schema_updates():
    if not settings.database_url.startswith("sqlite"):
        return
    inspector = inspect(engine)
    if "dispatches" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("dispatches")}
    updates = {
        "delivered_by": "ALTER TABLE dispatches ADD COLUMN delivered_by VARCHAR(120)",
        "packing_photo_path": "ALTER TABLE dispatches ADD COLUMN packing_photo_path VARCHAR(500)",
        "packing_photo_name": "ALTER TABLE dispatches ADD COLUMN packing_photo_name VARCHAR(255)",
    }
    for column, statement in updates.items():
        if column in columns:
            continue
        with engine.begin() as connection:
            connection.execute(text(statement))

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    apply_schema_updates()
    auth.ensure_default_users()
    Path(settings.file_storage_path).mkdir(parents=True, exist_ok=True)
    if settings.auto_seed:
        seed_demo()
    yield

app=FastAPI(title=settings.app_name,version="0.1.0",lifespan=lifespan)

PUBLIC_API_PREFIXES=(
    "/api/auth/login",
    "/api/integrations/gmail/push",
    "/api/magics/agent/jobs",
)

@app.middleware("http")
async def api_auth_middleware(request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if path.startswith("/api") and not any(path.startswith(prefix) for prefix in PUBLIC_API_PREFIXES):
        user_id = auth.user_id_from_authorization(request.headers.get("authorization"))
        if not user_id:
            return JSONResponse({"detail":"Login required"}, status_code=401)
        request.state.user_id = user_id
    return await call_next(request)

dev_origins=[
    settings.frontend_origin,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]
app.add_middleware(CORSMiddleware,allow_origins=list(dict.fromkeys(dev_origins)),allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
app.include_router(router)

@app.get("/health")
def health():
    return {"ok":True,"app":settings.app_name}
