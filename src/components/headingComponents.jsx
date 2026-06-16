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

export { slugify };
