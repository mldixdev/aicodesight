import { ProjectProfile, InventoryData, DuplicateData, DependencyData, ModuleMapData, ClaudeMdOptions } from '../types';
import { generateUnifiedTemplate } from '../templates/unifiedTemplate';
import { defaultSectionFlags } from '../templates/templateHelpers';

const MARKER_START = '<!-- aicodesight:start -->';
const MARKER_END = '<!-- aicodesight:end -->';

const USER_ZONE_HINT = `\
# CLAUDE.md

<!-- Your custom directives go here (this zone is preserved on updates) -->

`;

/**
 * Generates the AICodeSight section of CLAUDE.md wrapped in markers.
 */
export function generateClaudeMd(
  profile: ProjectProfile,
  inventory: InventoryData,
  duplicates: DuplicateData,
  deps: DependencyData,
  modules: ModuleMapData,
  options?: ClaudeMdOptions,
): string {
  const flags = options?.sectionFlags ?? defaultSectionFlags(profile.type);
  const template = generateUnifiedTemplate(
    profile, inventory, duplicates, deps, modules, flags, options,
  );

  return wrapWithMarkers(template);
}

function wrapWithMarkers(content: string): string {
  return `${MARKER_START}\n${content}\n${MARKER_END}`;
}

/**
 * Merges newly generated CLAUDE.md content into an existing file,
 * preserving everything the user wrote outside the aicodesight markers.
 *
 * - If existing has markers → replaces only the content between them.
 * - If existing has no markers → prepends user content + markers with new generated.
 * - If no existing file → adds user zone hint + markers with generated content.
 */
export function mergeClaudeMd(
  generatedContent: string,
  existingContent: string | null,
): string {
  // First time — no existing file
  if (!existingContent) {
    return USER_ZONE_HINT + generatedContent;
  }

  const startIdx = existingContent.indexOf(MARKER_START);
  const endIdx = existingContent.indexOf(MARKER_END);

  // Existing file has valid markers → replace between them
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingContent.substring(0, startIdx);
    const after = existingContent.substring(endIdx + MARKER_END.length);
    return before + generatedContent + after;
  }

  // Existing file without markers (user had a manual CLAUDE.md before AICodeSight)
  // Preserve all existing content above, append generated below
  return existingContent.trimEnd() + '\n\n' + generatedContent + '\n';
}
