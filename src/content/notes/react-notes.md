---
title: "React 小笔记"
date: "2026-06-12"
tags: ["React", "前端"]
---

## useState 基础

```jsx
const [count, setCount] = useState(0);
```

- `useState` 返回一个数组，第一个是值，第二个是更新函数
- 更新函数会触发重新渲染
