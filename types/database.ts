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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
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
          category: string;
          data_type: string;
          status: string;
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
          category: string;
          data_type: string;
          status?: string;
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
          category?: string;
          data_type?: string;
          status?: string;
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
    };
  };
}
