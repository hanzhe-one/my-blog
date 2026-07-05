---
title: 'React 小笔记'
publishDate: '2026-06-12'
description: 'React useState Hook 的基础用法笔记。'
tags:
  - React
  - 前端
---

## useState 基础

```jsx
const [count, setCount] = useState(0);
```

- `useState` 返回一个数组，第一个是值，第二个是更新函数
- 更新函数会触发重新渲染
