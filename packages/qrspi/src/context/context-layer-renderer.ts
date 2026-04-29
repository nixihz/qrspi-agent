import type {
  ContextLayer,
  ContextPointer,
  ContextSection,
  ContextSourceArtifact,
  DependencyContextPlan,
  FocusedContextData,
  IncludedContextDependency,
} from "../workflow/types.js";
import { estimateContextSize } from "./context-budget.js";
import { extractFocusedContextData } from "./focused-extraction.js";

export function renderContextLayer(
  source: ContextSourceArtifact,
  plan: DependencyContextPlan,
): IncludedContextDependency {
  if (source.missing) {
    return renderPointerLayer(source, plan, "missing dependency artifact");
  }

  if (plan.layer === "focused") return renderFocusedLayer(source, plan);
  if (plan.layer === "summary") return renderSummaryLayer(source, plan);
  if (plan.layer === "pointer") return renderPointerLayer(source, plan, "profile pointer layer");
  return renderFullLayer(source, plan);
}

export function renderFullLayer(
  source: ContextSourceArtifact,
  plan: DependencyContextPlan,
): IncludedContextDependency {
  return createIncludedDependency(source, plan, "full", source.rawContent, [
    createSection(source, plan, "full", "Full Artifact", source.rawContent),
  ]);
}

export function renderFocusedLayer(
  source: ContextSourceArtifact,
  plan: DependencyContextPlan,
): IncludedContextDependency {
  const focused = extractFocusedContextData(source);
  const fields = plan.focusedFields.length > 0
    ? plan.focusedFields
    : Object.keys(focused) as Array<keyof FocusedContextData>;
  const sections = fields
    .map((field) => ({
      field,
      items: focused[field] ?? [],
    }))
    .filter((entry) => entry.items.length > 0)
    .map((entry) => {
      const title = titleForFocusedField(entry.field);
      const content = renderList(title, entry.items);
      return createSection(source, plan, "focused", title, content);
    });

  if (sections.length === 0) {
    const summaryContent = renderSummaryText(source.rawContent);
    return createIncludedDependency(source, plan, "focused", summaryContent, [
      createSection(source, plan, "focused", "Focused Fallback", summaryContent),
    ]);
  }

  return createIncludedDependency(
    source,
    plan,
    "focused",
    sections.map((section) => `### ${section.title}\n${section.content}`).join("\n\n"),
    sections,
  );
}

export function renderSummaryLayer(
  source: ContextSourceArtifact,
  plan: DependencyContextPlan,
): IncludedContextDependency {
  const focused = extractFocusedContextData(source);
  const summaryItems = [
    ...((focused.decisions ?? []).slice(0, 5)),
    ...((focused.constraints ?? []).slice(0, 5)),
    ...((focused.risks ?? []).slice(0, 5)),
    ...((focused.evidence ?? []).slice(0, 5)),
  ];
  const content = summaryItems.length > 0
    ? renderList("Summary", summaryItems)
    : renderSummaryText(source.rawContent);

  return createIncludedDependency(source, plan, "summary", content, [
    createSection(source, plan, "summary", "Summary", content),
  ]);
}

export function renderPointerLayer(
  source: ContextSourceArtifact,
  plan: DependencyContextPlan,
  reason: string,
): IncludedContextDependency {
  const pointer = createPointer(source, reason);
  const content = [
    `Content omitted (${reason}).`,
    `Artifact: ${pointer.artifactPath}`,
    pointer.structuredPath ? `Structured: ${pointer.structuredPath}` : "",
  ].filter(Boolean).join("\n");

  return createIncludedDependency(source, plan, "pointer", content, [
    createSection(source, plan, "pointer", "Artifact Pointer", content, pointer),
  ], pointer);
}

export function downgradeDependencyToPointer(
  dependency: IncludedContextDependency,
  reason: string,
): IncludedContextDependency {
  const pointer: ContextPointer = {
    ...dependency.pointer,
    reason,
  };
  const content = [
    `Content omitted (${reason}).`,
    `Artifact: ${pointer.artifactPath}`,
    pointer.structuredPath ? `Structured: ${pointer.structuredPath}` : "",
  ].filter(Boolean).join("\n");

  return {
    ...dependency,
    layer: "pointer",
    summary: content,
    includedContent: content,
    includedEstimate: estimateContextSize(content),
    pointer,
    sections: [
      {
        id: `${dependency.stage}:pointer`,
        title: "Artifact Pointer",
        content,
        estimate: estimateContextSize(content),
        source: pointer,
        priority: dependency.priority,
        required: dependency.required,
      },
    ],
  };
}

function createIncludedDependency(
  source: ContextSourceArtifact,
  plan: DependencyContextPlan,
  layer: ContextLayer,
  content: string,
  sections: ContextSection[],
  pointer: ContextPointer = createPointer(source, `${layer} context layer`),
): IncludedContextDependency {
  const includedEstimate = estimateContextSize(content);
  return {
    stage: source.stage,
    artifactPath: source.artifactPath,
    summary: content,
    layer,
    required: plan.required,
    priority: plan.priority,
    includedContent: content,
    originalEstimate: source.estimate,
    includedEstimate,
    pointer,
    sections,
  };
}

function createSection(
  source: ContextSourceArtifact,
  plan: DependencyContextPlan,
  layer: ContextLayer,
  title: string,
  content: string,
  pointer: ContextPointer = createPointer(source, `${layer} section`),
): ContextSection {
  return {
    id: `${source.stage}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title,
    content,
    estimate: estimateContextSize(content),
    source: pointer,
    priority: plan.priority,
    required: plan.required,
  };
}

function createPointer(source: ContextSourceArtifact, reason: string): ContextPointer {
  return {
    stage: source.stage,
    artifactPath: source.artifactPath,
    structuredPath: source.structuredPath,
    reason,
  };
}

function titleForFocusedField(field: keyof FocusedContextData): string {
  return field
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderList(title: string, items: string[]): string {
  const lines = items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((item) => `- ${item}`);
  return [`${title}:`, ...lines].join("\n");
}

function renderSummaryText(content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 24);
  return lines.join("\n");
}
