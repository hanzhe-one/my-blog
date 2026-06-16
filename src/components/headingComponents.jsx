import { Children, createElement } from 'react';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function collectText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (node?.props?.children) {
    return Children.toArray(node.props.children).map(collectText).join('');
  }
  return '';
}

function heading(tag) {
  return function Heading({ children, ...rest }) {
    const text = Children.toArray(children).map(collectText).join('');
    const id = slugify(text);
    return createElement(tag, { ...rest, id }, children);
  };
}

export const headingComponents = {
  h1: heading('h1'),
  h2: heading('h2'),
  h3: heading('h3'),
};

export function extractHeadings(content) {
  const regex = /^(#{2,4})\s+(.+)$/gm;
  const flat = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    flat.push({
      level: match[1].length,
      text: match[2].trim(),
      id: slugify(match[2].trim()),
    });
  }
  return buildTocTree(flat);
}

function buildTocTree(flat) {
  const root = { level: 0, children: [] };
  const stack = [root];

  for (const h of flat) {
    const node = { ...h, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root.children;
}

export { slugify };
