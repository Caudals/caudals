"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function SettingsForms() {
  const [notifications, setNotifications] = useState({
    emailNewSubmission: true,
    emailRequestComplete: true,
    emailWeeklySummary: false,
    pushNewSubmission: true,
    pushRequestComplete: false,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            Update your account profile and company details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="Acme Corporation"
                defaultValue="Acme Corporation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://acme.com"
                defaultValue="https://acme.com"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                placeholder="John Doe"
                defaultValue="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@acme.com"
                defaultValue="john@acme.com"
              />
            </div>
          </div>
          <Button>Save Changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>
            Choose how you want to receive updates about your requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="mb-4 text-sm font-medium">Email Notifications</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="emailNewSubmission">New Submissions</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive an email when contributors submit new data
                  </p>
                </div>
                <Switch
                  id="emailNewSubmission"
                  checked={notifications.emailNewSubmission}
                  onCheckedChange={(checked) =>
                    setNotifications({
                      ...notifications,
                      emailNewSubmission: checked,
                    })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="emailRequestComplete">
                    Request Completed
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when your dataset request is complete
                  </p>
                </div>
                <Switch
                  id="emailRequestComplete"
                  checked={notifications.emailRequestComplete}
                  onCheckedChange={(checked) =>
                    setNotifications({
                      ...notifications,
                      emailRequestComplete: checked,
                    })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="emailWeeklySummary">Weekly Summary</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive a weekly summary of all your requests
                  </p>
                </div>
                <Switch
                  id="emailWeeklySummary"
                  checked={notifications.emailWeeklySummary}
                  onCheckedChange={(checked) =>
                    setNotifications({
                      ...notifications,
                      emailWeeklySummary: checked,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-medium">Push Notifications</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pushNewSubmission">New Submissions</Label>
                  <p className="text-sm text-muted-foreground">
                    Get push notifications for new submissions
                  </p>
                </div>
                <Switch
                  id="pushNewSubmission"
                  checked={notifications.pushNewSubmission}
                  onCheckedChange={(checked) =>
                    setNotifications({
                      ...notifications,
                      pushNewSubmission: checked,
                    })
                  }
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pushRequestComplete">Request Completed</Label>
                  <p className="text-sm text-muted-foreground">
                    Get push notifications when requests are complete
                  </p>
                </div>
                <Switch
                  id="pushRequestComplete"
                  checked={notifications.pushRequestComplete}
                  onCheckedChange={(checked) =>
                    setNotifications({
                      ...notifications,
                      pushRequestComplete: checked,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <Button>Save Preferences</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <div>
              <p className="text-sm font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data
              </p>
            </div>
            <Button variant="destructive" size="sm">
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
