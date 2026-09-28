from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "WaxPrint ERP"
    database_url: str = "sqlite:///./waxprint_erp.db"
    file_storage_path: str = "./data/files"
    frontend_origin: str = "http://localhost:5173"
    auto_seed: bool = True
    gmail_enabled: bool = False
    gmail_user: str = "me"
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_refresh_token: str = ""
    gmail_pubsub_topic: str = ""
    gmail_archive_label: str = "WAX_ERP_ARCHIVED"
    gmail_imap_host: str = "imap.gmail.com"
    gmail_imap_port: int = 993
    gmail_app_password: str = ""
    gmail_mailbox: str = "INBOX"
    gmail_fetch_query: str = "UNSEEN"
    gmail_fetch_limit: int = 25
    agent_token: str = "change-me"
    auth_secret: str = "change-me-auth-secret"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
