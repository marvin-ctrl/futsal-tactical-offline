ALTER TABLE project ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE project ADD COLUMN category TEXT NOT NULL DEFAULT 'attacking pattern';
ALTER TABLE project ADD COLUMN restart_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE project ADD COLUMN system TEXT;
ALTER TABLE project ADD COLUMN age_band TEXT;
ALTER TABLE project ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE project ADD COLUMN source_template_id TEXT;
