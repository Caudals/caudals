"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, RefreshCw, ExternalLink } from "lucide-react";

interface StripeDiagnostics {
  environment: string;
  timestamp: string;
  variables: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: {
      exists: boolean;
      format: string;
      length: number;
      preview: string | null;
    };
    STRIPE_SECRET_KEY: {
      exists: boolean;
      format: string;
      length: number;
      preview: string | null;
    };
    STRIPE_WEBHOOK_SECRET: {
      exists: boolean;
      format: string;
      length: number;
      preview: string | null;
    };
  };
  clientSide: {
    userAgent: string | null;
    origin: string | null;
    referer: string | null;
  };
  recommendations: string[];
}

export function StripeDebug() {
  const [diagnostics, setDiagnostics] = useState<StripeDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostics = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/debug/stripe');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setDiagnostics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const getStatusIcon = (exists: boolean, format: string) => {
    if (!exists) return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (format === 'valid') return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <AlertCircle className="h-4 w-4 text-yellow-500" />;
  };

  const getStatusBadge = (exists: boolean, format: string) => {
    if (!exists) return <Badge variant="destructive">Missing</Badge>;
    if (format === 'valid') return <Badge variant="default">Valid</Badge>;
    return <Badge variant="secondary">Invalid Format</Badge>;
  };

  if (process.env.NODE_ENV === 'production') {
    return null; // No mostrar en producción
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          Stripe Configuration Debug
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDiagnostics}
            disabled={loading}
            className="ml-auto"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm text-red-700">{error}</span>
          </div>
        )}

        {diagnostics && (
          <div className="space-y-6">
            {/* Environment Info */}
            <div>
              <h3 className="font-medium mb-2">Environment</h3>
              <div className="flex items-center gap-2">
                <Badge variant={diagnostics.environment === 'development' ? 'default' : 'secondary'}>
                  {diagnostics.environment}
                </Badge>
                <span className="text-sm text-gray-600">
                  Last checked: {new Date(diagnostics.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Variables */}
            <div>
              <h3 className="font-medium mb-3">Environment Variables</h3>
              <div className="space-y-3">
                {Object.entries(diagnostics.variables).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(value.exists, value.format)}
                      <div>
                        <div className="font-mono text-sm">{key}</div>
                        {value.preview && (
                          <div className="text-xs text-gray-600">{value.preview}</div>
                        )}
                        <div className="text-xs text-gray-500">Length: {value.length}</div>
                      </div>
                    </div>
                    {getStatusBadge(value.exists, value.format)}
                  </div>
                ))}
              </div>
            </div>

            {/* Client Side Info */}
            <div>
              <h3 className="font-medium mb-2">Client Information</h3>
              <div className="space-y-2 text-sm">
                <div><strong>Origin:</strong> {diagnostics.clientSide.origin || 'N/A'}</div>
                <div><strong>Referer:</strong> {diagnostics.clientSide.referer || 'N/A'}</div>
                <div><strong>User Agent:</strong> {diagnostics.clientSide.userAgent?.substring(0, 50)}...</div>
              </div>
            </div>

            {/* Recommendations */}
            {diagnostics.recommendations.length > 0 && (
              <div>
                <h3 className="font-medium mb-2 text-yellow-700">Recommendations</h3>
                <ul className="space-y-1">
                  {diagnostics.recommendations.map((rec, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diagnostics.recommendations.length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-700">
                  All Stripe configuration looks good!
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}