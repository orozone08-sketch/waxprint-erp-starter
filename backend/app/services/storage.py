import hashlib
from pathlib import Path
from fastapi import UploadFile
from app.config import settings

BASE = Path(settings.file_storage_path)
BASE.mkdir(parents=True, exist_ok=True)

async def save_upload(job_number: str, upload: UploadFile, folder: str = "original"):
    target_dir = BASE / job_number / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    data = await upload.read()
    digest = hashlib.sha256(data).hexdigest()
    safe_name = Path(upload.filename or "file.bin").name
    path = target_dir / safe_name
    path.write_bytes(data)
    return str(path), digest, len(data)
