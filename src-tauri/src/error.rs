use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Filesystem I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Path not found: {0}")]
    NotFound(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Invalid UTF-8 encoding: {0}")]
    InvalidEncoding(String),

    #[error("Unsupported asset format: {0}")]
    UnsupportedAssetFormat(String),

    #[error("Watcher error: {0}")]
    Watcher(String),

    #[error("LSP error: {0}")]
    Lsp(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Serialize)]
pub struct AppErrorPayload {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let (code, message, details) = match self {
            AppError::Io(err) => ("IO_ERROR", err.to_string(), None),
            AppError::NotFound(p) => ("NOT_FOUND", format!("Path not found: {p}"), Some(p.clone())),
            AppError::InvalidPath(p) => (
                "INVALID_PATH",
                format!("Invalid path: {p}"),
                Some(p.clone()),
            ),
            AppError::InvalidEncoding(msg) => ("INVALID_ENCODING", msg.clone(), None),
            AppError::UnsupportedAssetFormat(fmt) => (
                "UNSUPPORTED_ASSET",
                format!("Unsupported asset format: {fmt}"),
                Some(fmt.clone()),
            ),
            AppError::Watcher(msg) => ("WATCHER_ERROR", msg.clone(), None),
            AppError::Lsp(msg) => ("LSP_ERROR", msg.clone(), None),
            AppError::Internal(msg) => ("INTERNAL_ERROR", msg.clone(), None),
        };

        let payload = AppErrorPayload {
            code: code.to_string(),
            message,
            details,
        };
        payload.serialize(serializer)
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_serialization() {
        let err = AppError::NotFound("/path/to/missing.tex".into());
        let json = serde_json::to_string(&err).expect("serialize error");
        assert!(json.contains("NOT_FOUND"));
        assert!(json.contains("missing.tex"));
    }

    #[test]
    fn test_io_error_conversion() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "access denied");
        let app_err = AppError::from(io_err);
        let json = serde_json::to_string(&app_err).expect("serialize error");
        assert!(json.contains("IO_ERROR"));
        assert!(json.contains("access denied"));
    }
}
