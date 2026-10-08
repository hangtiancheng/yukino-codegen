type MetricLabels = Readonly<Record<string, string>>;

export type AiMetricInput = Readonly<{
  modelRole: string;
  status: "success" | "error";
}>;

export type MetricsService = Readonly<{
  contentType: string;
  recordAiError: (input: { errorType: string; modelRole: string }) => void;
  recordAiRequest: (input: AiMetricInput) => void;
  recordAiResponseTime: (input: { durationMs: number; modelRole: string }) => void;
  recordAiTokenUsage: (input: {
    modelRole: string;
    tokenType: "input" | "output";
    tokens: number;
  }) => void;
  render: () => string;
}>;

const labelKey = (labels: MetricLabels): string =>
  Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");

const formatLabels = (labels: MetricLabels): string =>
  `{${Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}="${value.replaceAll('"', '\\"')}"`)
    .join(",")}}`;

const increment = (
  values: Map<string, { labels: MetricLabels; value: number }>,
  labels: MetricLabels,
  amount = 1,
): void => {
  const key = labelKey(labels);
  const current = values.get(key)?.value ?? 0;
  values.set(key, { labels, value: current + amount });
};

const renderCounter = (
  name: string,
  help: string,
  values: Map<string, { labels: MetricLabels; value: number }>,
): string =>
  [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} counter`,
    ...Array.from(values.values()).map(
      (entry) => `${name}${formatLabels(entry.labels)} ${String(entry.value)}`,
    ),
  ].join("\n");

export const createMetricsService = (): MetricsService => {
  const requests = new Map<string, { labels: MetricLabels; value: number }>();
  const errors = new Map<string, { labels: MetricLabels; value: number }>();
  const tokens = new Map<string, { labels: MetricLabels; value: number }>();
  const responseTimes = new Map<string, { labels: MetricLabels; value: number }>();

  return {
    contentType: "text/plain; version=0.0.4; charset=utf-8",
    recordAiError: (input) => {
      increment(errors, {
        error_type: input.errorType,
        model_role: input.modelRole,
      });
    },
    recordAiRequest: (input) => {
      increment(requests, {
        model_role: input.modelRole,
        status: input.status,
      });
    },
    recordAiResponseTime: (input) => {
      increment(responseTimes, { model_role: input.modelRole }, input.durationMs / 1000);
    },
    recordAiTokenUsage: (input) => {
      increment(tokens, { model_role: input.modelRole, token_type: input.tokenType }, input.tokens);
    },
    render: () =>
      [
        renderCounter("ai_model_requests_total", "Total AI model requests", requests),
        renderCounter("ai_model_errors_total", "Total AI model errors", errors),
        renderCounter("ai_model_tokens_total", "Total AI token usage", tokens),
        renderCounter(
          "ai_model_response_duration_seconds_sum",
          "Total AI response duration seconds",
          responseTimes,
        ),
      ].join("\n"),
  };
};
