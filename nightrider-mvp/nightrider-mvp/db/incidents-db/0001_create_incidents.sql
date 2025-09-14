-- Create incidents table
CREATE TABLE incidents (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'new',
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    trace_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    rca_analysis TEXT,
    actions_taken TEXT,
    metadata TEXT
);