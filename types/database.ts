export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "contributor" | "requester" | "admin";
export type SubmissionStatus = "pending" | "approved" | "rejected";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type WaitlistStatus = "pending" | "contacted" | "qualified" | "converted";
export type DatasetCategory =
  | "computer-vision"
  | "natural-language"
  | "speech-audio"
  | "healthcare"
  | "robotics"
  | "other";
export type DataType = "image" | "video" | "audio" | "text" | "mixed";
export type DatasetStatus = "active" | "closing-soon" | "completed" | "paused";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          role: UserRole;
          mail: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          mail?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          mail?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      dataset_requests: {
        Row: {
          id: string;
          created_by: string;
          title: string;
          description: string;
          category: DatasetCategory;
          data_type: DataType;
          status: DatasetStatus;
          samples_needed: number;
          samples_collected: number;
          reward_amount: number;
          currency: string;
          deadline: string;
          quality_criteria: string[];
          requirements: string[];
          featured: boolean;
          approval_status: ApprovalStatus;
          admin_notes: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_by: string;
          title: string;
          description: string;
          category: DatasetCategory;
          data_type: DataType;
          status?: DatasetStatus;
          samples_needed: number;
          samples_collected?: number;
          reward_amount: number;
          currency?: string;
          deadline: string;
          quality_criteria: string[];
          requirements: string[];
          featured?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          created_by?: string;
          title?: string;
          description?: string;
          category?: DatasetCategory;
          data_type?: DataType;
          status?: DatasetStatus;
          samples_needed?: number;
          samples_collected?: number;
          reward_amount?: number;
          currency?: string;
          deadline?: string;
          quality_criteria?: string[];
          requirements?: string[];
          featured?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      submissions: {
        Row: {
          id: string;
          dataset_request_id: string;
          contributor_id: string;
          file_urls: string[];
          metadata: Json;
          status: SubmissionStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dataset_request_id: string;
          contributor_id: string;
          file_urls: string[];
          metadata?: Json;
          status?: SubmissionStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          dataset_request_id?: string;
          contributor_id?: string;
          file_urls?: string[];
          metadata?: Json;
          status?: SubmissionStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      waitlist_signups: {
        Row: {
          id: string;
          full_name: string | null;
          email: string;
          company: string | null;
          use_case: string | null;
          status: WaitlistStatus;
          metadata: Json;
          last_notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name?: string | null;
          email: string;
          company?: string | null;
          use_case?: string | null;
          status?: WaitlistStatus;
          metadata?: Json;
          last_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string;
          company?: string | null;
          use_case?: string | null;
          status?: WaitlistStatus;
          metadata?: Json;
          last_notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: UserRole;
      submission_status: SubmissionStatus;
      waitlist_status: WaitlistStatus;
      dataset_category: DatasetCategory;
      dataset_status: DatasetStatus;
      data_type: DataType;
      approval_status: ApprovalStatus;
    };
  };
}
