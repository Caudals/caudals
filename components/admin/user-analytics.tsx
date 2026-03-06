"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  UserPlus,
  UserCheck,
  TrendingUp,
  Search,
  Download,
  Loader2,
  MapPin,
  Shield,
  FileText,
} from "lucide-react";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";
import { translateReactNode } from "@/lib/i18n/translate-node";

interface UserAnalytics {
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  userGrowth: number;
  userRetention: number;
  averageSessionTime: number;
  userDistribution: {
    contributors: number;
    requesters: number;
    admins: number;
  };
  topUsers: {
    id: string;
    name: string;
    email: string;
    role: string;
    joinDate: string;
    lastActive: string;
    contributions?: number;
    earnings?: number;
    datasets?: number;
    spending?: number;
    status: "active" | "inactive" | "suspended";
  }[];
  userActivity: {
    date: string;
    newUsers: number;
    activeUsers: number;
    sessions: number;
  }[];
  geographicDistribution: {
    country: string;
    users: number;
    percentage: number;
  }[];
}

export function UserAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<UserAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const toast = useLocaleToast();
  const t = useTranslations();

  useEffect(() => {
    loadUserAnalytics();
  }, []);

  const loadUserAnalytics = async () => {
    setLoading(true);
    try {
      // Mock data - in real implementation, this would call an admin API
      const mockData: UserAnalytics = {
        totalUsers: 1247,
        newUsers: 89,
        activeUsers: 892,
        userGrowth: 12.5,
        userRetention: 78.3,
        averageSessionTime: 24.5,
        userDistribution: {
          contributors: 1023,
          requesters: 187,
          admins: 3
        },
        topUsers: [
          {
            id: "1",
            name: "Alice Johnson",
            email: "alice@example.com",
            role: "contributor",
            joinDate: "2024-01-15",
            lastActive: "2024-12-20",
            contributions: 45,
            earnings: 225.00,
            status: "active"
          },
          {
            id: "2",
            name: "Bob Smith",
            email: "bob@techcorp.com",
            role: "requester",
            joinDate: "2024-02-20",
            lastActive: "2024-12-19",
            datasets: 8,
            spending: 1600.00,
            status: "active"
          },
          {
            id: "3",
            name: "Carol Davis",
            email: "carol@example.com",
            role: "contributor",
            joinDate: "2024-03-10",
            lastActive: "2024-12-18",
            contributions: 32,
            earnings: 160.00,
            status: "active"
          },
          {
            id: "4",
            name: "David Wilson",
            email: "david@datalab.com",
            role: "requester",
            joinDate: "2024-04-05",
            lastActive: "2024-12-17",
            datasets: 6,
            spending: 1200.00,
            status: "active"
          },
          {
            id: "5",
            name: "Eva Brown",
            email: "eva@example.com",
            role: "contributor",
            joinDate: "2024-05-12",
            lastActive: "2024-12-16",
            contributions: 25,
            earnings: 125.00,
            status: "inactive"
          }
        ],
        userActivity: generateUserActivityData(),
        geographicDistribution: [
          { country: "United States", users: 456, percentage: 36.6 },
          { country: "United Kingdom", users: 234, percentage: 18.8 },
          { country: "Canada", users: 189, percentage: 15.2 },
          { country: "Germany", users: 156, percentage: 12.5 },
          { country: "Australia", users: 98, percentage: 7.9 },
          { country: "Other", users: 114, percentage: 9.1 }
        ]
      };

      setAnalyticsData(mockData);
    } catch {
      toast.error("Failed to load user analytics");
    } finally {
      setLoading(false);
    }
  };

  const generateUserActivityData = () => {
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      data.push({
        date: date.toISOString().split('T')[0],
        newUsers: Math.floor(Math.random() * 10) + 1,
        activeUsers: Math.floor(Math.random() * 50) + 20,
        sessions: Math.floor(Math.random() * 100) + 50
      });
    }
    return data;
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
      case "active":
        return <Badge className="bg-green-500">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "contributor":
        return <Badge variant="outline" className="text-blue-600">Contributor</Badge>;
      case "requester":
        return <Badge variant="outline" className="text-green-600">Requester</Badge>;
      case "admin":
        return <Badge variant="outline" className="text-purple-600">Admin</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const filteredUsers = analyticsData?.topUsers.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStatus = statusFilter === "all" || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  }) || [];

  const handleExport = async () => {
    if (!analyticsData) return;
    
    try {
      const csvContent = [
        "Name,Email,Role,Join Date,Last Active,Status,Contributions,Earnings,Datasets,Spending",
        ...analyticsData.topUsers.map(user => [
          user.name,
          user.email,
          user.role,
          user.joinDate,
          user.lastActive,
          user.status,
          user.contributions || 0,
          user.earnings || 0,
          user.datasets || 0,
          user.spending || 0
        ].join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `user-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(t("User analytics exported successfully!"));
    } catch {
      toast.error(t("Failed to export user analytics"));
    }
  };

  if (loading) {
    const content = (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading user analytics...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );

    return translateReactNode(content, t);
  }

  if (!analyticsData) {
    const content = (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <Users className="h-12 w-12 mx-auto text-slate-500 mb-2" />
              <p className="text-slate-500">No user analytics data available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );

    return translateReactNode(content, t);
  }

  const content = (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Analytics</h2>
          <p className="text-slate-500">Comprehensive user behavior and engagement metrics</p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Data
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-slate-500">
              +{analyticsData.userGrowth}% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Users</CardTitle>
            <UserPlus className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.newUsers}</div>
            <p className="text-xs text-slate-500">
              This month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <UserCheck className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.activeUsers.toLocaleString()}</div>
            <p className="text-xs text-slate-500">
              {((analyticsData.activeUsers / analyticsData.totalUsers) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retention Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.userRetention}%</div>
            <p className="text-xs text-slate-500">
              {analyticsData.averageSessionTime}min avg session
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>User Distribution by Role</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span>Contributors</span>
                </div>
                <div className="text-right">
                  <div className="font-medium">{analyticsData.userDistribution.contributors}</div>
                  <div className="text-sm text-slate-500">
                    {((analyticsData.userDistribution.contributors / analyticsData.totalUsers) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-600" />
                  <span>Requesters</span>
                </div>
                <div className="text-right">
                  <div className="font-medium">{analyticsData.userDistribution.requesters}</div>
                  <div className="text-sm text-slate-500">
                    {((analyticsData.userDistribution.requesters / analyticsData.totalUsers) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  <span>Admins</span>
                </div>
                <div className="text-right">
                  <div className="font-medium">{analyticsData.userDistribution.admins}</div>
                  <div className="text-sm text-slate-500">
                    {((analyticsData.userDistribution.admins / analyticsData.totalUsers) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Geographic Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analyticsData.geographicDistribution.map((location, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-500" />
                    <span className="text-sm">{location.country}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{location.users}</div>
                    <div className="text-xs text-slate-500">{location.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>User Management</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="all">All Roles</option>
                <option value="contributor">Contributors</option>
                <option value="requester">Requesters</option>
                <option value="admin">Admins</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Join Date</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getRoleBadge(user.role)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(user.joinDate)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(user.lastActive)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(user.status)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {user.role === "contributor" ? (
                        <div>
                          <p>{user.contributions} contributions</p>
                          <p className="text-slate-500">{formatAmount(user.earnings || 0)} earned</p>
                        </div>
                      ) : (
                        <div>
                          <p>{user.datasets} datasets</p>
                          <p className="text-slate-500">{formatAmount(user.spending || 0)} spent</p>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  return translateReactNode(content, t);
}
