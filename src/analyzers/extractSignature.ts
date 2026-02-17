import {
  SyntaxKind, Node,
  FunctionDeclaration, ClassDeclaration, InterfaceDeclaration,
  TypeAliasDeclaration, VariableDeclaration, EnumDeclaration,
} from 'ts-morph';

export const MAX_SIGNATURE_LENGTH = 200;

/**
 * Compress a generic type like Task<IEnumerable<ResultadoListDto>> -> Task<...>
 * but keep simple types like string, number, void, boolean unchanged.
 */
export function compressType(typeStr: string): string {
  // Simple types — keep as-is
  if (/^(string|number|boolean|void|any|int|Task|Promise)$/.test(typeStr)) return typeStr;
  // Already short enough
  if (typeStr.length <= 25) return typeStr;
  // Compress outer generic: Promise<Something<Very<Long>>> -> Promise<...>
  const genericMatch = typeStr.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    const inner = genericMatch[2];
    if (inner.length > 15) return `${genericMatch[1]}<...>`;
  }
  // Compress union/intersection types
  if (typeStr.length > 30 && (typeStr.includes(' | ') || typeStr.includes(' & '))) {
    return typeStr.substring(0, 25) + '...';
  }
  return typeStr;
}

/**
 * Truncate a members-based signature (class, interface) at the last complete
 * member boundary, adding a count of what's left.
 */
export function truncMemberSig(parts: string[], totalMembers: number, prefix?: string): string {
  const pre = prefix ? `${prefix}; ` : '';
  let result = `{ ${pre}`;
  let includedCount = 0;

  for (const part of parts) {
    const candidate = includedCount === 0
      ? `${result}${part}`
      : `${result}; ${part}`;

    // +20 for closing " ... +N }" suffix
    if (candidate.length + 20 > MAX_SIGNATURE_LENGTH && includedCount > 0) break;

    result = candidate;
    includedCount++;
  }

  const remaining = totalMembers - includedCount;
  if (remaining > 0) {
    result += ` ... +${remaining} more`;
  }
  return `${result} }`;
}

/**
 * Collapse multiline destructured params into compact prop names.
 * "({ asChild = false, isActive = false, variant = "default", ...props }: Type) => any"
 * becomes: "({ asChild?, isActive?, variant?, ...props }) => any"
 */
export function compactFunctionSig(rawSig: string): string {
  // Collapse newlines first
  let sig = rawSig.replace(/\n\s*/g, ' ').replace(/\s+/g, ' ');

  // Detect destructured object param: ({ ... }: Type) => Return
  const destructMatch = sig.match(/^\s*\(\s*\{([^}]+)\}\s*:\s*([^)]+)\)\s*=>\s*(.+)$/);
  if (destructMatch) {
    const propsBlock = destructMatch[1];
    const returnType = destructMatch[3].trim();

    // Extract prop names from destructured block
    const props = propsBlock.split(',').map(p => {
      const trimmed = p.trim();
      if (trimmed.startsWith('...')) return trimmed.split(':')[0].trim();
      const name = trimmed.split(/[=:]/)[0].trim();
      // Mark as optional if it had a default value
      const hasDefault = trimmed.includes('=');
      return hasDefault ? `${name}?` : name;
    }).filter(p => p.length > 0);

    return `({ ${props.join(', ')} }) => ${compressType(returnType)}`;
  }

  // Regular function — just compress if long
  if (sig.length <= MAX_SIGNATURE_LENGTH) return sig;
  return sig.substring(0, MAX_SIGNATURE_LENGTH - 3) + '...';
}

export function extractSignature(node: Node, kind: SyntaxKind): string | undefined {
  try {
    switch (kind) {
      case SyntaxKind.FunctionDeclaration: {
        const fn = node as FunctionDeclaration;
        const typeParams = fn.getTypeParameters();
        const tpStr = typeParams.length > 0
          ? `<${typeParams.map(tp => tp.getText()).join(', ')}>`
          : '';
        const params = fn.getParameters().map(p => {
          const pName = p.getName();
          const optional = p.isOptional() ? '?' : '';
          const pType = p.getTypeNode()?.getText() || p.getType().getText(p);
          return `${pName}${optional}: ${pType}`;
        }).join(', ');
        const returnType = fn.getReturnTypeNode()?.getText()
          || fn.getReturnType().getText(fn);
        const raw = `${tpStr}(${params}) => ${returnType}`;
        return compactFunctionSig(raw);
      }

      case SyntaxKind.ClassDeclaration: {
        const cls = node as ClassDeclaration;

        // Inheritance prefix
        const inhParts: string[] = [];
        const ext = cls.getExtends();
        const impls = cls.getImplements();
        if (ext) inhParts.push(`extends ${ext.getText()}`);
        if (impls.length > 0) inhParts.push(`implements ${impls.map(i => i.getText()).join(', ')}`);
        const prefix = inhParts.length > 0 ? inhParts.join(', ') : undefined;

        const methodParts: string[] = [];

        // Constructor
        const ctors = cls.getConstructors();
        if (ctors.length > 0) {
          const ctor = ctors[0];
          const cParams = ctor.getParameters().map(p => {
            const pName = p.getName();
            const pType = p.getTypeNode()?.getText() || p.getType().getText(p);
            return `${pName}: ${compressType(pType)}`;
          }).join(', ');
          methodParts.push(`new(${cParams})`);
        }

        // Public methods
        const allMethods = cls.getMethods()
          .filter(m => !m.hasModifier(SyntaxKind.PrivateKeyword) && !m.hasModifier(SyntaxKind.ProtectedKeyword));
        for (const m of allMethods.slice(0, 8)) {
          const mParams = m.getParameters().map(p => {
            const pType = p.getTypeNode()?.getText() || p.getType().getText(p);
            return `${p.getName()}: ${compressType(pType)}`;
          }).join(', ');
          const mRet = m.getReturnTypeNode()?.getText() || m.getReturnType().getText(m);
          methodParts.push(`${m.getName()}(${mParams}): ${compressType(mRet)}`);
        }

        if (methodParts.length === 0 && !prefix) return undefined;
        return truncMemberSig(methodParts, allMethods.length + (ctors.length > 0 ? 1 : 0), prefix);
      }

      case SyntaxKind.InterfaceDeclaration: {
        const iface = node as InterfaceDeclaration;
        const allMembers = iface.getMembers();
        const parts: string[] = [];
        for (const member of allMembers.slice(0, 8)) {
          let text = member.getText().replace(/\n\s*/g, ' ').trim();
          if (text.endsWith(';')) text = text.slice(0, -1).trim();
          // Compress long types inside member declarations
          if (text.length > 50) {
            const colonIdx = text.indexOf(':');
            if (colonIdx > 0) {
              const name = text.substring(0, colonIdx);
              const typeStr = text.substring(colonIdx + 1).trim();
              text = `${name}: ${compressType(typeStr)}`;
            }
          }
          parts.push(text);
        }
        if (parts.length === 0) return undefined;
        return truncMemberSig(parts, allMembers.length);
      }

      case SyntaxKind.TypeAliasDeclaration: {
        const ta = node as TypeAliasDeclaration;
        let typeText = ta.getTypeNode()?.getText() || ta.getType().getText(ta);
        typeText = typeText.replace(/\n\s*/g, ' ').replace(/\s+/g, ' ');
        if (typeText.length > MAX_SIGNATURE_LENGTH) {
          return typeText.substring(0, MAX_SIGNATURE_LENGTH - 3) + '...';
        }
        return typeText;
      }

      case SyntaxKind.VariableDeclaration: {
        const vd = node as VariableDeclaration;
        let typeText = vd.getTypeNode()?.getText() || vd.getType().getText(vd);
        // Avoid unhelpful signatures like "string[]" for simple consts —
        // but DO include function types and complex object types
        if (/^(string|number|boolean|null|undefined|any|unknown|void|never)(\[\])?$/.test(typeText)) {
          return undefined;
        }
        // Collapse multiline and try to compact
        typeText = typeText.replace(/\n\s*/g, ' ').replace(/\s+/g, ' ');
        // Object-like const (service objects with methods) — check BEFORE function
        // because object types like { method: () => ... } contain '=>' inside
        if (typeText.startsWith('{') && typeText.length > MAX_SIGNATURE_LENGTH) {
          // Extract top-level member names: words that appear right after { or ;
          // at depth 0, which are the property/method names of the object
          const names: string[] = [];
          let depth = 0;
          let expectName = true; // after { or ; we expect a member name
          let i = 1; // skip opening {
          while (i < typeText.length) {
            const ch = typeText[i];
            // Skip => arrow operator (the > is NOT a closing bracket)
            if (ch === '=' && i + 1 < typeText.length && typeText[i + 1] === '>') { i += 2; continue; }
            if (ch === '{' || ch === '(' || ch === '<') { depth++; expectName = false; }
            else if (ch === '}' || ch === ')' || ch === '>') { depth--; }
            else if (depth === 0 && ch === ';') { expectName = true; }
            else if (depth === 0 && expectName && /[a-zA-Z]/.test(ch)) {
              const wordMatch = typeText.substring(i).match(/^(\w+)/);
              if (wordMatch) {
                names.push(wordMatch[1]);
                i += wordMatch[1].length;
                expectName = false;
                continue;
              }
            }
            i++;
          }
          if (names.length > 0) {
            return `{ ${names.join(', ')} }`;
          }
        }
        // If it's a function type (e.g. arrow assigned to const), compact it
        if (typeText.includes('=>') || typeText.includes('(')) {
          return compactFunctionSig(typeText);
        }
        if (typeText.length > MAX_SIGNATURE_LENGTH) {
          return typeText.substring(0, MAX_SIGNATURE_LENGTH - 3) + '...';
        }
        return typeText;
      }

      case SyntaxKind.EnumDeclaration: {
        const en = node as EnumDeclaration;
        const members = en.getMembers().map(m => m.getName());
        if (members.length <= 10) {
          return `{ ${members.join(', ')} }`;
        }
        const sig = `{ ${members.slice(0, 10).join(', ')} ... +${members.length - 10} more }`;
        return sig;
      }

      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}
