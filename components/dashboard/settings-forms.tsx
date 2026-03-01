import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function SettingsForms() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Full name" />
          <Input placeholder="Email" type="email" />
          <Button type="button" variant="outline">
            Save profile
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Company name" />
          <Input placeholder="Website" />
          <Button type="button" variant="outline">
            Save organization
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
