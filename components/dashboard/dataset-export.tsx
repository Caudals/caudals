"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Download, 
  FileArchive, 
  Users, 
  FileText, 
  Calendar,
  Loader2,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { getDatasetExportStats, createDatasetZip } from "@/lib/actions/export-actions";

interface DatasetExportProps {
  datasetId: string;
  datasetTitle: string;
  samplesCollected: number;
  samplesNeeded: number;
  status: string;
}

export function DatasetExport({ 
  datasetId, 
  datasetTitle, 
  samplesCollected, 
  samplesNeeded, 
  status 
}: DatasetExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStats, setExportStats] = useState<{
    dataset_title: string;
    total_submissions: number;
    total_files: number;
    total_size: number;
    contributors: string[];
    date_range: {
      earliest: string | null;
      latest: string | null;
    };
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const isCompleted = status === "completed";
  const hasApprovedSubmissions = samplesCollected > 0;

  const loadExportStats = async () => {
    setLoadingStats(true);
    try {
      const result = await getDatasetExportStats(datasetId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.data) {
        setExportStats(result.data);
      }
    } catch {
      toast.error("Failed to load export statistics");
    } finally {
      setLoadingStats(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await createDatasetZip(datasetId);
      
      if (result.error) {
        toast.error(result.error);
        return;
      }

      // Create download link
      const blob = new Blob([result.data!], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${datasetTitle.replace(/[^a-zA-Z0-9]/g, '_')}_dataset.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Dataset exported successfully!", {
        action: {
          label: "×",
          onClick: () => toast.dismiss(),
        },
      });
    } catch {
      toast.error("Failed to export dataset", {
        action: {
          label: "×",
          onClick: () => toast.dismiss(),
        },
      });
    } finally {
      setIsExporting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string | null) => {
    return dateString ? new Date(dateString).toLocaleDateString() : "N/A";
  };

  if (!hasApprovedSubmissions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            Dataset Export
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">
              No approved submissions available for export
            </p>
            <p className="text-sm text-muted-foreground">
              Wait for contributors to submit files and admin approval
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileArchive className="h-5 w-5" />
          Dataset Export
          {isCompleted && (
            <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
              <CheckCircle className="h-3 w-3 mr-1" />
              Ready
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Collection Progress</span>
          <span className="text-sm text-muted-foreground">
            {samplesCollected} / {samplesNeeded} samples
          </span>
        </div>
        
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min((samplesCollected / samplesNeeded) * 100, 100)}%` }}
          />
        </div>

        {/* Export Statistics */}
        {!exportStats && (
          <Button 
            variant="outline" 
            onClick={loadExportStats}
            disabled={loadingStats}
            className="w-full"
          >
            {loadingStats ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Load Export Statistics
          </Button>
        )}

        {exportStats && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{exportStats.total_submissions}</p>
                <p className="text-xs text-muted-foreground">Submissions</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{exportStats.total_files}</p>
                <p className="text-xs text-muted-foreground">Files</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{exportStats.contributors.length}</p>
                <p className="text-xs text-muted-foreground">Contributors</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <FileArchive className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{formatFileSize(exportStats.total_size)}</p>
                <p className="text-xs text-muted-foreground">Total Size</p>
              </div>
            </div>
          </div>
        )}

        {/* Export Button */}
        <Button 
          onClick={handleExport}
          disabled={isExporting || !hasApprovedSubmissions}
          className="w-full"
          size="lg"
        >
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {isExporting ? "Creating Export..." : "Export Dataset"}
        </Button>

        {/* Export Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Export includes all approved submissions</p>
          <p>• Files organized by contributor</p>
          <p>• Metadata included for each submission</p>
          <p>• ZIP format for easy distribution</p>
        </div>

        {/* Date Range */}
        {exportStats?.date_range?.earliest && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>
              {formatDate(exportStats.date_range.earliest)} - {formatDate(exportStats.date_range.latest)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
