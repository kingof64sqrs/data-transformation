// DataFusion Intelligence Platform — TypeScript API types

export interface SummaryStats {
  source_records: number;
  vault_records: number;
  canonical_records: number;
  identity_matches: number;
  review_pending: number;
  master_records: number;
  auto_merged: number;
  manual_review: number;
  decided_separate: number;
  pipeline_health: 'healthy' | 'degraded' | 'error';
}

export interface LiveFeedEvent {
  type: string;
  message: string;
  data: Record<string, unknown>;
  ts?: string;
  timestamp?: string;
  record_id?: string | number | null;
  summary?: SummaryStats;
}

export interface VaultRecord {
  vault_id: number;
  cust_id: string;
  source_system: string;
  ingested_at: string;
  raw_payload: Record<string, unknown>;
  kafka_offset: number;
  kafka_partition: number;
}

export interface CanonicalRecord {
  canonical_id: number;
  cust_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  email_valid: boolean;
  phone: string;
  phone_valid: boolean;
  birth_date: string;
  address: string;
  city: string;
  state: string;
  completeness_score: number;
  normalized_at: string;
}

export interface MatchSignals {
  email_score: number;
  phone_score: number;
  name_score: number;
  dob_score: number;
  city_score?: number;
  address_score: number;
}

export interface MatchRecord {
  match_id: number;
  record1_id: number;
  record2_id: number;
  record1: {
    customer_id: string;
    full_name: string;
    email: string;
    phone_number: string;
    date_of_birth: string;
    address_line1: string;
    city: string;
    state: string;
  };
  record2: {
    customer_id: string;
    full_name: string;
    email: string;
    phone_number: string;
    date_of_birth: string;
    address_line1: string;
    city: string;
    state: string;
  };
  signals: MatchSignals;
  composite_score: number;
  ai_confidence: number;
  ai_reasoning: string;
  llm_explanation?: string;
  llm_confidence?: number;
  final_score?: number;
  blocking_keys?: string[];
  decision: 'auto_merged' | 'manual_review' | 'decided_separate' | 'pending';
}

export interface ReviewItem extends MatchRecord {
  queue_id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  ai_suggestion: AISuggestion | null;
}

export interface AISuggestion {
  suggestion: 'approve' | 'reject' | 'uncertain';
  confidence: number;
  reasoning: string;
  key_signals: string[];
  risk_flags: string[];
  alternative_explanation: string;
}

export interface MasterRecord {
  master_id: string;
  full_name: string;
  email_primary: string;
  emails_all: string[];
  phone: string;
  birth_date: string;
  address: string;
  city: string;
  state: string;
  source_ids: string[];
  source_systems: string[];
  confidence_score: number;
  record_quality_score?: number;
  llm_summary?: string;
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface MasterCorrection {
  field_name: string;
  current_value: string;
  proposed_value: string;
  confidence: number;
  source_record_id: string;
}

export interface MasterCorrectionExample {
  cust_id: string;
  raw: {
    full_name: string;
    email: string;
    phone: string;
    city: string;
    state: string;
  };
  master: {
    master_id: string;
    full_name: string;
    email: string;
    phone: string;
    city: string;
    state: string;
  };
  corrections: MasterCorrection[];
}

export interface MasterCorrectionsPreviewResponse {
  examples: MasterCorrectionExample[];
}

export interface PipelineEvent {
  type: 'stage_start' | 'stage_complete' | 'log' | 'error' | 'heartbeat' | 'pipeline_complete';
  message: string;
  data: Record<string, unknown>;
  ts: string;
}

export interface StageResult {
  stage: string;
  records_in: number;
  records_out: number;
  duration_ms: number;
  status: 'completed' | 'failed' | 'skipped';
}

export interface PipelineRunResult {
  run_id: string;
  status: 'completed' | 'failed' | 'partial';
  stats: SummaryStats;
  duration_ms: number;
  stages: StageResult[];
}

export interface IdentityStats {
  total_matches: number;
  auto_merged: number;
  manual_review: number;
  decided_separate: number;
  pending: number;
  avg_confidence: number;
  score_distribution: Array<{ range: string; count: number }>;
}

export interface CanonicalStats {
  total: number;
  avg_completeness: number;
  valid_emails_pct: number;
  valid_phones_pct: number;
}

export interface DataQualityReport {
  quality_score: number;
  issues: string[];
  recommendations: string[];
  summary: string;
}

export interface LineageResult {
  cust_id: string;
  source: Record<string, unknown> | null;
  vault: Record<string, unknown> | null;
  canonical: Record<string, unknown> | null;
  matches: Array<{
    match_id: number;
    composite_score: number;
    decision: string;
    partner_cust_id: string;
    partner_name: string;
  }>;
  master: MasterRecord | null;
  timeline: Array<{ stage: string; event: string; ts: string }>;
}
