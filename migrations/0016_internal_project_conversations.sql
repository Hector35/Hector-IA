ALTER TABLE conversations ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN project_id TEXT;
ALTER TABLE conversations ADD COLUMN project_role TEXT;

UPDATE conversations
SET is_internal=1,
    project_role='director',
    project_id=(SELECT p.id FROM agent_projects p WHERE p.director_conversation_id=conversations.id LIMIT 1)
WHERE id IN (SELECT director_conversation_id FROM agent_projects WHERE director_conversation_id IS NOT NULL);

UPDATE conversations
SET is_internal=1,
    project_role='agent',
    project_id=(SELECT t.project_id FROM agent_project_tasks t WHERE t.agent_conversation_id=conversations.id LIMIT 1)
WHERE id IN (SELECT agent_conversation_id FROM agent_project_tasks WHERE agent_conversation_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_conversations_user_internal_updated ON conversations(user_id,is_internal,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id,project_role);
