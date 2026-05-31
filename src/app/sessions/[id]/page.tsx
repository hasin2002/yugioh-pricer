import { SessionWorkspace } from "@/components/session-workspace";

type SessionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params;

  return <SessionWorkspace sessionId={Number(id)} />;
}
