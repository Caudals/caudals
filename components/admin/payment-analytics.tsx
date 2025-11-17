"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  CreditCard,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Download,
  Loader2,
  BarChart3,
  PieChart,
  Activity,
} from "lucide-react";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";
import { translateReactNode } from "@/lib/i18n/translate-node";

interface PaymentAnalytics {
  overview: {
    totalRevenue: number;
    platformCommission: number;
    totalTransactions: number;
    averageTransaction: number;
    successRate: number;
  };
  transactionMetrics: {
    completed: number;
    pending: number;
    failed: number;
    refunded: number;
    totalVolume: number;
  };
  revenueMetrics: {
    dailyRevenue: number;
    weeklyRevenue: number;
    monthlyRevenue: number;
    yearlyRevenue: number;
    growthRate: number;
  };
  paymentMethods: {
    method: string;
    count: number;
    volume: number;
    percentage: number;
  }[];
  topTransactions: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    type: string;
    user: string;
    date: string;
    description: string;
  }[];
  revenueByPeriod: {
    period: string;
    revenue: number;
    transactions: number;
    commission: number;
  }[];
  failedPayments: {
    id: string;
    amount: number;
    reason: string;
    user: string;
    date: string;
    retryCount: number;
  }[];
}

export function PaymentAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<PaymentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30d");
  const [selectedMetric, setSelectedMetric] = useState("overview");
  const toast = useLocaleToast();
  const t = useTranslations();

  useEffect(() => {
    loadPaymentAnalytics();
  }, [timeRange]);

  const loadPaymentAnalytics = async () => {
    setLoading(true);
    try {
      // Mock data - in real implementation, this would call an admin API
      const mockData: PaymentAnalytics = {
        overview: {
          totalRevenue: 45680.50,
          platformCommission: 4568.05,
          totalTransactions: 2341,
          averageTransaction: 19.51,
          successRate: 94.2
        },
        transactionMetrics: {
          completed: 2205,
          pending: 23,
          failed: 12,
          refunded: 8,
          totalVolume: 45680.50
        },
        revenueMetrics: {
          dailyRevenue: 1522.68,
          weeklyRevenue: 10658.78,
          monthlyRevenue: 45680.50,
          yearlyRevenue: 548166.00,
          growthRate: 18.5
        },
        paymentMethods: [
          { method: "Credit Card", count: 1890, volume: 34560.25, percentage: 75.7 },
          { method: "Debit Card", count: 320, volume: 6234.50, percentage: 13.7 },
          { method: "Bank Transfer", count: 98, volume: 3456.75, percentage: 7.6 },
          { method: "Digital Wallet", count: 33, volume: 1429.00, percentage: 3.1 }
        ],
        topTransactions: [
          {
            id: "txn_001",
            amount: 500.00,
            currency: "USD",
            status: "completed",
            type: "dataset_funding",
            user: "TechCorp Inc.",
            date: "2024-12-20",
            description: "Large dataset collection project"
          },
          {
            id: "txn_002",
            amount: 350.00,
            currency: "USD",
            status: "completed",
            type: "dataset_funding",
            user: "DataLab LLC",
            date: "2024-12-19",
            description: "AI training data collection"
          },
          {
            id: "txn_003",
            amount: 250.00,
            currency: "USD",
            status: "completed",
            type: "dataset_funding",
            user: "StartupXYZ",
            date: "2024-12-18",
            description: "Market research dataset"
          },
          {
            id: "txn_004",
            amount: 200.00,
            currency: "USD",
            status: "pending",
            type: "dataset_funding",
            user: "University Lab",
            date: "2024-12-20",
            description: "Research dataset funding"
          },
          {
            id: "txn_005",
            amount: 150.00,
            currency: "USD",
            status: "failed",
            type: "dataset_funding",
            user: "Small Business",
            date: "2024-12-19",
            description: "Customer data collection"
          }
        ],
        revenueByPeriod: generateRevenueByPeriod(),
        failedPayments: [
          {
            id: "txn_005",
            amount: 150.00,
            reason: "Insufficient funds",
            user: "Small Business",
            date: "2024-12-19",
            retryCount: 2
          },
          {
            id: "txn_012",
            amount: 75.00,
            reason: "Card expired",
            user: "Individual User",
            date: "2024-12-18",
            retryCount: 1
          },
          {
            id: "txn_018",
            amount: 100.00,
            reason: "Bank declined",
            user: "Research Group",
            date: "2024-12-17",
            retryCount: 3
          }
        ]
      };

      setAnalyticsData(mockData);
    } catch {
      toast.error(t("Failed to load payment analytics"));
    } finally {
      setLoading(false);
    }
  };

  const generateRevenueByPeriod = () => {
    const periods = [];
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      const revenue = Math.floor(Math.random() * 1000) + 500;
      const transactions = Math.floor(Math.random() * 20) + 5;
      const commission = revenue * 0.10;
      
      periods.push({
        period: date.toISOString().split('T')[0],
        revenue,
        transactions,
        commission
      });
    }
    
    return periods;
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Completed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "refunded":
        return <Badge variant="secondary">Refunded</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "refunded":
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const handleExport = async () => {
    if (!analyticsData) return;
    
    try {
      const csvContent = [
        "Metric,Value",
        `Total Revenue,${analyticsData.overview.totalRevenue}`,
        `Platform Commission,${analyticsData.overview.platformCommission}`,
        `Total Transactions,${analyticsData.overview.totalTransactions}`,
        `Average Transaction,${analyticsData.overview.averageTransaction}`,
        `Success Rate,${analyticsData.overview.successRate}%`,
        `Growth Rate,${analyticsData.revenueMetrics.growthRate}%`,
        `Daily Revenue,${analyticsData.revenueMetrics.dailyRevenue}`,
        `Weekly Revenue,${analyticsData.revenueMetrics.weeklyRevenue}`,
        `Monthly Revenue,${analyticsData.revenueMetrics.monthlyRevenue}`
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payment-analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(t("Payment analytics exported successfully!"));
    } catch {
      toast.error(t("Failed to export payment analytics"));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading payment analytics...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No payment analytics data available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Payment Analytics</h2>
          <p className="text-muted-foreground">Comprehensive payment and revenue insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExport} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(analyticsData.overview.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              +{analyticsData.revenueMetrics.growthRate}% from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Platform Commission</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(analyticsData.overview.platformCommission)}</div>
            <p className="text-xs text-muted-foreground">
              10% of total revenue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.totalTransactions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {analyticsData.overview.successRate}% success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Transaction</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatAmount(analyticsData.overview.averageTransaction)}</div>
            <p className="text-xs text-muted-foreground">
              Per transaction
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.overview.successRate}%</div>
            <p className="text-xs text-muted-foreground">
              Payment success
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.transactionMetrics.completed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {((analyticsData.transactionMetrics.completed / analyticsData.overview.totalTransactions) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.transactionMetrics.pending}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting processing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.transactionMetrics.failed}</div>
            <p className="text-xs text-muted-foreground">
              {((analyticsData.transactionMetrics.failed / analyticsData.overview.totalTransactions) * 100).toFixed(1)}% failure rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Refunded</CardTitle>
            <AlertCircle className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.transactionMetrics.refunded}</div>
            <p className="text-xs text-muted-foreground">
              Total refunds
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsData.paymentMethods.map((method, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{method.method}</p>
                    <p className="text-sm text-muted-foreground">
                      {method.count} transactions
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatAmount(method.volume)}</p>
                  <p className="text-sm text-muted-foreground">
                    {method.percentage}% of total
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent High-Value Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsData.topTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {getStatusIcon(transaction.status)}
                  <div>
                    <p className="font-medium">{transaction.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.user} • {transaction.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(transaction.date)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatAmount(transaction.amount)}</p>
                  {getStatusBadge(transaction.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Failed Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Failed Payments Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsData.failedPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <div>
                    <p className="font-medium">{payment.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {payment.user} • {payment.reason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(payment.date)} • {payment.retryCount} retries
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-red-600">{formatAmount(payment.amount)}</p>
                  <Badge variant="destructive">Failed</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return translateReactNode(content, t);
}
