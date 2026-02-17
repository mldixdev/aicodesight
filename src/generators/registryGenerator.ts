import * as path from 'path';
import {
  InventoryData, ModuleMapData, DependencyData,
  RegistryData, RegistryModule, RegistryExport,
} from '../types';

/**
 * Generates registry.json — the codebase registry organized by module.
 * Combines inventory (files + exports + signatures), module detection,
 * and dependency data into a single JSON that the AI reads to know
 * what exists and how to use it without opening source files.
 */
export function generateRegistry(
  inventory: InventoryData,
  modules: ModuleMapData,
  deps: DependencyData,
): RegistryData {
  const registry: RegistryData = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    modules: {},
  };

  // Index modules by path for fast lookup
  const modulesByPath = new Map<string, { mod: typeof modules.modules[0]; key: string }>();
  for (const mod of modules.modules) {
    const normalizedPath = mod.path.replace(/\\/g, '/');
    modulesByPath.set(normalizedPath, { mod, key: normalizedPath });
  }

  // Build dependency index: file → files it imports
  const fileImports = new Map<string, Set<string>>();
  for (const dep of deps.mostImported) {
    for (const importer of dep.importedBy) {
      if (!fileImports.has(importer)) fileImports.set(importer, new Set());
      fileImports.get(importer)!.add(dep.file);
    }
  }

  // Initialize registry modules
  for (const mod of modules.modules) {
    const key = mod.path.replace(/\\/g, '/');
    registry.modules[key] = {
      type: mod.type,
      ...(mod.description ? { description: mod.description } : {}),
      exports: {},
    };
  }

  const unmapped: Record<string, RegistryExport> = {};

  // Assign each file's exports to their module
  for (const file of inventory.files) {
    const filePath = file.path.replace(/\\/g, '/');
    const module = findModule(filePath, modulesByPath);
    const fileName = path.basename(filePath);

    for (const exp of file.exports) {
      if (exp.name === 'default') continue;

      const entry: RegistryExport = {
        type: exp.type,
        file: fileName,
        line: exp.line,
        ...(exp.signature ? { signature: exp.signature } : {}),
      };

      if (module) {
        // If duplicate name within same module, keep the one with a signature
        const existing = registry.modules[module.key].exports[exp.name];
        if (existing && existing.signature && !entry.signature) continue;
        registry.modules[module.key].exports[exp.name] = entry;
      } else {
        unmapped[`${filePath}:${exp.name}`] = entry;
      }
    }
  }

  // Compute dependsOn per module
  for (const [moduleKey, regModule] of Object.entries(registry.modules)) {
    const depModules = new Set<string>();

    for (const file of inventory.files) {
      const filePath = file.path.replace(/\\/g, '/');
      if (!filePath.startsWith(moduleKey + '/') && filePath !== moduleKey) continue;

      const imports = fileImports.get(filePath);
      if (!imports) continue;

      for (const importedFile of imports) {
        const importedModule = findModule(importedFile, modulesByPath);
        if (importedModule && importedModule.key !== moduleKey) {
          depModules.add(importedModule.key);
        }
      }
    }

    if (depModules.size > 0) {
      regModule.dependsOn = Array.from(depModules).sort();
    }
  }

  // Remove empty modules (no exports mapped)
  for (const [key, mod] of Object.entries(registry.modules)) {
    if (Object.keys(mod.exports).length === 0) {
      delete registry.modules[key];
    }
  }

  // Only add unmapped if there are entries
  if (Object.keys(unmapped).length > 0) {
    registry.unmapped = unmapped;
  }

  return registry;
}

function findModule(
  filePath: string,
  modulesByPath: Map<string, { mod: any; key: string }>,
): { mod: any; key: string } | undefined {
  // Find the longest matching module path (most specific)
  let bestMatch: { mod: any; key: string } | undefined;
  let bestLen = 0;

  for (const [modulePath, entry] of modulesByPath) {
    if (filePath.startsWith(modulePath + '/') || filePath === modulePath) {
      if (modulePath.length > bestLen) {
        bestLen = modulePath.length;
        bestMatch = entry;
      }
    }
  }

  return bestMatch;
}
