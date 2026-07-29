/**
 * Dialog for authenticating with Jira
 */

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface JiraAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceUrl: string;
  onSuccess: () => void;
}

export function JiraAuthDialog({
  open,
  onOpenChange,
  instanceUrl,
  onSuccess,
}: JiraAuthDialogProps) {
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError("请输入邮箱");
      return;
    }

    if (!apiToken.trim()) {
      setError("请输入 API 令牌");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.claude.jira.authenticate(
        instanceUrl,
        "apitoken",
        apiToken,
        email.trim()
      );

      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else {
        setLoading(false);
        setEmail("");
        setApiToken("");
        onSuccess();
        onOpenChange(false);
      }
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setEmail("");
      setApiToken("");
      setError(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Jira 认证</DialogTitle>
          <DialogDescription>
            输入你的 Jira API 令牌以连接。可在 Atlassian 账户设置中创建 API 令牌。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="instanceUrl" className="text-sm font-medium">
                实例 URL
              </label>
              <Input
                id="instanceUrl"
                value={instanceUrl}
                disabled
                className="opacity-60"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                邮箱
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoFocus
              />
              <p className="text-sm text-muted-foreground">
                与你的 Atlassian 账户关联的邮箱
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="apiToken" className="text-sm font-medium">
                API 令牌
              </label>
              <Input
                id="apiToken"
                type="password"
                placeholder="输入你的 Jira API 令牌"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                disabled={loading}
              />
              <p className="text-sm text-muted-foreground">
                在{" "}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  id.atlassian.com
                </a>
                {" "}创建令牌
              </p>
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-3">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "认证中…" : "连接"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
