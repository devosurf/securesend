import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { client } from "../api/client";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { data, isPending } = useQuery({
    queryFn: async () => {
      const response = await client.api.health.$get();
      if (!response.ok) {
        throw new Error("the api is unwell");
      }
      return await response.json();
    },
    queryKey: ["health"],
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-2 px-6">
      <h1 className="font-medium text-2xl">SecureSend</h1>
      <p className="text-neutral-400">
        Paste a secret, get one link, the link opens once.
      </p>
      <p className="mt-6 text-neutral-500 text-sm">
        api: {isPending ? "checking" : (data?.status ?? "unreachable")}
      </p>
    </main>
  );
}
