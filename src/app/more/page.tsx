"use client";

import { Amount, Card, PageHeader, Row, SectionTitle } from "@/components/ui";
import { useData, useFriendBalances, useNetWorth, useSafeToSpend } from "@/lib/store/selectors";

export default function MorePage() {
  const d = useData();
  const nw = useNetWorth();
  const sts = useSafeToSpend();
  const bal = useFriendBalances();
  const net = [...bal.values()].reduce((a, b) => a + b, 0);
  const unread = d.notifications.filter((n) => !n.read).length;
  return (
    <div>
      <PageHeader title="More" />
      <Card href="/invest/portfolio">
        <p className="text-xs text-muted">Net worth</p>
        <p className="text-2xl font-bold"><Amount value={nw.total} /></p>
        <p className="text-xs text-muted">incl. investments <Amount value={nw.investments} /> · card dues <Amount value={-nw.cards} /></p>
      </Card>
      <SectionTitle>Money</SectionTitle>
      <Card className="p-1">
        <Row href="/invest" left="🚀" title="IPO tracker" sub={sts.holds ? <>Holds <Amount value={sts.holds} /></> : "Apply → allot → list → sell"} right="›" />
        <Row href="/invest/portfolio" left="📈" title="Portfolio & net worth" right="›" />
        <Row href="/friends" left="👥" title="Friends" sub={net === 0 ? "All settled" : <>Net <Amount value={net} sign /></>} right="›" />
        <Row href="/plan/goals" left="🎯" title="Goals & savings" right="›" />
        <Row href="/plan/recurring" left="🔁" title="Recurring, rent & subscriptions" right="›" />
      </Card>
      <SectionTitle>Insights</SectionTitle>
      <Card className="p-1">
        <Row href="/reports" left="📉" title="Reports" sub="Monthly report, trends, heatmap, Wrapped" right="›" />
        <Row href="/notifications" left="🔔" title="Notifications" sub={unread ? `${unread} unread` : "All caught up"} right="›" />
        <Row href="/tax" left="🧾" title="Tax helper" sub="HRA rent, IPO capital gains, 80C" right="›" />
      </Card>
      <SectionTitle>App</SectionTitle>
      <Card className="p-1">
        <Row href="/settings" left="⚙️" title="Settings" sub="Accounts, categories, rules, security, data" right="›" />
      </Card>
    </div>
  );
}
