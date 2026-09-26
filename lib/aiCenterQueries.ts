// Shared with schema integration tests so UI queries cannot drift from migrations.
export const aiCenterQueries = [
  ['human_handoffs', 'created_at'], ['outreach_sequences', 'created_at'],
  ['automation_jobs', 'created_at'], ['sequence_enrollments', 'created_at'],
  ['message_events', 'occurred_at'], ['ai_runs', 'created_at'],
  ['suppression_list', 'created_at'], ['leads', 'created_at'],
  ['outreach_policy', null], ['enrichment_requests', 'created_at'],
] as const;
