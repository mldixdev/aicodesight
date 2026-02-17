import * as path from 'path';
import * as fs from 'fs';
import { ProjectProfile, DomainContext, DomainEntity, DomainField, DomainRelationship, DomainModule } from '../types';
import { findFilesByExtension } from '../shared/walkDirectory';

const AUDIT_FIELD_PATTERNS = /^(created|updated|modified|deleted|fecha|audit|log|timestamp|usuario)/i;
const FK_PATTERNS = /^(id[A-Z]|fk_|.*_id$|.*Id$)/;
const PK_PATTERNS = /^(id|pk|.*_pk)$/i;

/**
 * Analyze domain context from documentation, SQL, Prisma, or C# files.
 */
export function analyzeDomainContext(
  targetDir: string,
  profile: ProjectProfile,
  excludeDirs: string[],
): DomainContext {
  const entities: DomainEntity[] = [];
  const modules: DomainModule[] = [];
  const dataSourceHints: string[] = [];

  // 1. Parse .md files (highest priority for new projects)
  const mdEntities = parseMdFiles(targetDir, excludeDirs);
  entities.push(...mdEntities.entities);
  modules.push(...mdEntities.modules);
  if (mdEntities.entities.length > 0) dataSourceHints.push('Markdown documentation');

  // 2. Parse .sql files
  const sqlEntities = parseSqlFiles(targetDir, excludeDirs);
  const newSql = sqlEntities.filter(e => !entities.some(ex => ex.name === e.name));
  entities.push(...newSql);
  if (sqlEntities.length > 0) dataSourceHints.push('SQL scripts');

  // 3. Parse prisma schema
  const prismaEntities = parsePrismaSchema(targetDir);
  const newPrisma = prismaEntities.filter(e => !entities.some(ex => ex.name === e.name));
  entities.push(...newPrisma);
  if (prismaEntities.length > 0) dataSourceHints.push('Prisma schema');

  // 4. Infer modules from entities if none were found in .md
  if (modules.length === 0 && entities.length > 0) {
    modules.push(...inferModules(entities));
  }

  return { entities, modules, dataSourceHints };
}

// === Markdown Parsing ===

function parseMdFiles(targetDir: string, excludeDirs: string[]): { entities: DomainEntity[]; modules: DomainModule[] } {
  const mdFiles = findFiles(targetDir, '.md', excludeDirs);
  const entities: DomainEntity[] = [];
  const modules: DomainModule[] = [];

  for (const file of mdFiles) {
    let content: string;
    try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }

    // Extract entities from table definitions
    const mdEntities = extractEntitiesFromMd(content);
    entities.push(...mdEntities);

    // Extract modules from section headers
    const mdModules = extractModulesFromMd(content);
    modules.push(...mdModules);
  }

  return { entities, modules };
}

function extractEntitiesFromMd(content: string): DomainEntity[] {
  const entities: DomainEntity[] = [];
  const seenNames = new Set<string>();

  // Strategy 1: Parse sections with headers like "### SEP_TableName" or "### 3.1 SEP_TableName (Principal)"
  // that contain field definition tables (Columna|Tipo pattern)
  const sections = content.split(/(?=^#{1,4}\s)/m);

  for (const section of sections) {
    // Match headers with optional numbering: "### 3.1 SEP_EjecucionPresupuestaria (Principal)"
    const headerMatch = section.match(/^#{1,4}\s+(?:\d+[\d.]*\s+)?([A-Z]\w{2,})(?:\s*\(([^)]*)\))?/);
    if (!headerMatch) continue;

    const entityName = headerMatch[1];
    // Skip non-entity headers and FK names
    if (/^(Frontend|Backend|Database|Modulo|Stack|Tech|Estructura|Requisito|Indice|Tabla|Resumen|Diagrama|Foreign|Volumen|Informacion|Arquitectura|Paquete|Datos|Nota|FK_)/i.test(entityName)) continue;

    // Must have a table with column/field definition headers (Columna|Column|Campo + Tipo|Type)
    const tableHeaderMatch = section.match(/\|([^\n]*(?:Columna|Column|Campo)[^\n]*)\|\n\|[-:\s|]+\|\n((?:\|[^\n]*\|\n?)+)/i);
    if (!tableHeaderMatch) continue;

    const rows = tableHeaderMatch[2].trim().split('\n');
    const fields: DomainField[] = [];
    const relationships: DomainRelationship[] = [];
    let recordCount: number | undefined;

    // Parse record count from header parenthetical or body
    if (headerMatch[2]) {
      const countMatch = headerMatch[2].match(/([\d,.]+)/);
      if (countMatch) recordCount = parseInt(countMatch[1].replace(/[,.]/g, ''), 10);
    }
    if (!recordCount) {
      const bodyCountMatch = section.match(/\*?\*?Registros:?\*?\*?\s*([\d,.]+)/i);
      if (bodyCountMatch) recordCount = parseInt(bodyCountMatch[1].replace(/[,.]/g, ''), 10);
    }

    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim().replace(/`/g, '')).filter(c => c.length > 0);
      if (cols.length < 2) continue;

      const fieldName = cols[0];
      const fieldType = cols[1];

      // Skip rows that don't look like field definitions (e.g. rows where first col is a number)
      if (/^\d+$/.test(fieldName)) continue;

      const nullable = cols.some(c => /^(SI|YES|NULL)$/i.test(c));
      const isPk = PK_PATTERNS.test(fieldName) || cols.some(c => /\bPK\b|primary/i.test(c));
      const isFk = FK_PATTERNS.test(fieldName) || cols.some(c => /\bFK\b|foreign/i.test(c));

      fields.push({
        name: fieldName,
        type: fieldType,
        nullable,
        isPrimaryKey: isPk,
        isForeignKey: isFk,
        referencedEntity: isFk ? inferReferencedEntity(fieldName) : undefined,
      });

      if (isFk) {
        const target = inferReferencedEntity(fieldName);
        if (target) {
          relationships.push({ targetEntity: target, type: 'belongs-to', foreignKey: fieldName });
        }
      }
    }

    if (fields.length > 0 && !seenNames.has(entityName)) {
      seenNames.add(entityName);
      entities.push({
        name: entityName,
        type: classifyEntity(fields, recordCount),
        fields,
        relationships,
        source: 'md-file',
        recordCount,
      });
    }
  }

  // Strategy 2: Parse summary catalog tables like:
  // | **TableName** | N | Descripcion |
  // These provide entity names + record counts even if no field details
  const summaryTableRegex = /\|[^\n]*(?:Tabla|Table)[^\n]*\|\n\|[-:\s|]+\|\n((?:\|[^\n]*\|\n?)+)/gi;
  let summaryMatch;
  while ((summaryMatch = summaryTableRegex.exec(content)) !== null) {
    const rows = summaryMatch[1].trim().split('\n');
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cols.length < 2) continue;

      // Extract entity name from bold or plain text
      const nameCol = cols[0].replace(/\*\*/g, '').trim();
      if (!nameCol || nameCol.length < 3 || seenNames.has(nameCol)) continue;

      // Extract record count from second column
      const countCol = cols[1]?.trim();
      const countMatch = countCol?.match(/^(\d+)$/);
      const recordCount = countMatch ? parseInt(countMatch[1], 10) : undefined;

      // Only add if it looks like an entity name (starts with letter, not a FK name, has reasonable length)
      if (/^[A-Z]/.test(nameCol) && !nameCol.startsWith('FK_') && nameCol.length < 60 && !seenNames.has(nameCol)) {
        seenNames.add(nameCol);
        entities.push({
          name: nameCol,
          type: recordCount !== undefined && recordCount < 50 ? 'catalog' : 'unknown',
          fields: [],
          relationships: [],
          source: 'md-file',
          recordCount,
        });
      }
    }
  }

  return entities;
}

function extractModulesFromMd(content: string): DomainModule[] {
  const modules: DomainModule[] = [];
  const seenNames = new Set<string>();

  // Pattern 1: "System Modules" section with a markdown table
  // | Módulo | Descripción |
  const moduleTableRegex = /#{1,3}\s*(?:M[oó]dulos?\s+del\s+Sistema|Modules?|M[oó]dulos?\s+Funcionales?)[^\n]*\n(?:[\s\S]*?)(\|[^\n]*(?:M[oó]dulo|Module|Nombre)[^\n]*\|\n\|[-:\s|]+\|\n(?:\|[^\n]*\|\n?)+)/i;
  const tableMatch = moduleTableRegex.exec(content);
  if (tableMatch) {
    const fullTable = tableMatch[1];
    const rowsSection = fullTable.match(/\|[-:\s|]+\|\n((?:\|[^\n]*\|\n?)+)/);
    if (rowsSection) {
      const rows = rowsSection[1].trim().split('\n');
      for (const row of rows) {
        const cols = row.split('|').map(c => c.trim()).filter(c => c.length > 0);
        if (cols.length < 2) continue;
        const name = cols[0].replace(/\*\*/g, '').trim();
        const description = cols[1]?.replace(/\*\*/g, '').trim() || '';
        if (name.length > 3 && name.length < 50 && !/^\d/.test(name) && !seenNames.has(name)) {
          seenNames.add(name);
          modules.push({ name, description, entities: [], source: 'md-file' });
        }
      }
    }
  }

  // Pattern 2: Bullet points under a "Modulos" header
  const moduleSection = content.match(/#{1,3}\s*(?:Modules?|M[oó]dulos?|Funcionalidades?)[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|\n---|\z)/i);
  if (moduleSection) {
    const lines = moduleSection[1].split('\n');
    for (const line of lines) {
      const bulletMatch = line.match(/[-*]\s+\*?\*?([^(*\n:|]+)(?:[:(|]\s*(.+))?/);
      if (!bulletMatch) continue;
      const name = bulletMatch[1].trim();
      const description = bulletMatch[2]?.trim()?.replace(/[)*|].*$/, '') || '';
      if (name.length > 2 && name.length < 50 && !seenNames.has(name)) {
        seenNames.add(name);
        modules.push({ name, description, entities: [], source: 'md-file' });
      }
    }
  }

  return modules;
}

// === SQL Parsing ===

function parseSqlFiles(targetDir: string, excludeDirs: string[]): DomainEntity[] {
  const sqlFiles = findFiles(targetDir, '.sql', excludeDirs);
  const entities: DomainEntity[] = [];

  for (const file of sqlFiles) {
    let content: string;
    try { content = fs.readFileSync(file, 'utf-8'); } catch { continue; }

    const createTableRegex = /CREATE\s+TABLE\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?\s*\(([\s\S]*?)\);?(?=\s*(?:CREATE|GO|ALTER|$))/gi;
    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[1];
      const body = match[2];
      const fields = parseSqlColumns(body);
      const relationships = fields.filter(f => f.isForeignKey).map(f => ({
        targetEntity: inferReferencedEntity(f.name) || 'unknown',
        type: 'belongs-to' as const,
        foreignKey: f.name,
      }));

      entities.push({
        name: tableName,
        type: classifyEntity(fields),
        fields,
        relationships,
        source: 'sql-file',
      });
    }
  }

  return entities;
}

function parseSqlColumns(body: string): DomainField[] {
  const fields: DomainField[] = [];
  const lines = body.split(',').map(l => l.trim());

  for (const line of lines) {
    // Skip constraints
    if (/^\s*(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|INDEX)/i.test(line)) continue;

    const colMatch = line.match(/^\[?(\w+)\]?\s+(\w+(?:\([^)]*\))?)/);
    if (!colMatch) continue;

    const name = colMatch[1];
    const type = colMatch[2];
    const nullable = !/NOT\s+NULL/i.test(line);
    const isPk = /PRIMARY\s+KEY/i.test(line) || /IDENTITY/i.test(line);
    const isFk = FK_PATTERNS.test(name);

    fields.push({
      name, type, nullable,
      isPrimaryKey: isPk,
      isForeignKey: isFk,
      referencedEntity: isFk ? inferReferencedEntity(name) : undefined,
    });
  }

  return fields;
}

// === Prisma Parsing ===

function parsePrismaSchema(targetDir: string): DomainEntity[] {
  const schemaPath = path.join(targetDir, 'prisma', 'schema.prisma');
  if (!fs.existsSync(schemaPath)) return [];

  let content: string;
  try { content = fs.readFileSync(schemaPath, 'utf-8'); } catch { return []; }

  const entities: DomainEntity[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let match;

  while ((match = modelRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: DomainField[] = [];
    const relationships: DomainRelationship[] = [];

    const lines = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('@@') && !l.startsWith('//'));

    for (const line of lines) {
      const fieldMatch = line.match(/^(\w+)\s+(\w+)(\??)(?:\s+@.*)?$/);
      if (!fieldMatch) continue;

      const fieldName = fieldMatch[1];
      const fieldType = fieldMatch[2];
      const nullable = fieldMatch[3] === '?';

      const isPk = line.includes('@id');
      const isFk = line.includes('@relation');

      fields.push({
        name: fieldName,
        type: fieldType,
        nullable,
        isPrimaryKey: isPk,
        isForeignKey: isFk,
      });

      if (isFk) {
        relationships.push({
          targetEntity: fieldType,
          type: 'belongs-to',
          foreignKey: fieldName,
        });
      }
    }

    if (fields.length > 0) {
      entities.push({
        name,
        type: classifyEntity(fields),
        fields,
        relationships,
        source: 'prisma',
      });
    }
  }

  return entities;
}

// === Helpers ===

function classifyEntity(fields: DomainField[], recordCount?: number): DomainEntity['type'] {
  const hasAuditFields = fields.some(f => AUDIT_FIELD_PATTERNS.test(f.name));
  const fkCount = fields.filter(f => f.isForeignKey).length;
  const fieldCount = fields.length;

  // Few fields + no audit + low FK → likely a catalog
  if (fieldCount <= 6 && !hasAuditFields && fkCount <= 1) return 'catalog';
  // Explicit low record count → catalog
  if (recordCount !== undefined && recordCount < 50) return 'catalog';
  // Has audit fields or many FKs → transactional
  if (hasAuditFields || fkCount >= 3) return 'transactional';
  // High record count → transactional
  if (recordCount !== undefined && recordCount > 1000) return 'transactional';
  // Many-to-many junction table
  if (fieldCount <= 3 && fkCount === 2) return 'relation';

  return 'unknown';
}

function inferReferencedEntity(fkName: string): string | undefined {
  // "idInstitucion" → "Institucion", "fk_user_id" → "user"
  let clean = fkName
    .replace(/^(id|fk_?)/i, '')
    .replace(/(_id|Id)$/, '');
  if (clean.length < 2) return undefined;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function inferModules(entities: DomainEntity[]): DomainModule[] {
  const modules: DomainModule[] = [];

  // Group catalogs together
  const catalogs = entities.filter(e => e.type === 'catalog');
  if (catalogs.length > 0) {
    modules.push({
      name: 'Catalogs',
      description: 'Catalog table management (lookups)',
      entities: catalogs.map(e => e.name),
      source: 'inferred',
    });
  }

  // Each transactional entity gets its own module
  const transactions = entities.filter(e => e.type === 'transactional');
  for (const entity of transactions) {
    const name = entity.name.replace(/^(SEP_|TBL_|VW_)/i, '');
    // Skip dashboard variants — group with parent
    if (name.toLowerCase().includes('dashboard')) {
      modules.push({
        name: 'Dashboard',
        description: `Dashboard view based on ${entity.name}`,
        entities: [entity.name],
        source: 'inferred',
      });
    } else {
      modules.push({
        name: name,
        description: `${name} management`,
        entities: [entity.name],
        source: 'inferred',
      });
    }
  }

  return modules;
}

function findFiles(dir: string, ext: string, excludeDirs: string[]): string[] {
  return findFilesByExtension(dir, ext, excludeDirs, true)
    .filter(f => { const n = path.basename(f); return n !== 'CLAUDE.md' && n !== '.claudeignore'; });
}
