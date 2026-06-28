---
name: typescript-config
description: TypeScript 配置规范
---

# TypeScript 配置规范

## ✅ 必需配置

对于 React Native / Expo 项目，`tsconfig.json` 必须包含：

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "jsx": "react-native",  // ⚠️ 必须设置，否则会报 JSX 错误
    "paths": {
      "@/*": ["./*"]        // 路径别名配置
    }
  }
}
```

## 🔧 关键要点

1. **jsx 配置**: 必须设置 `"jsx": "react-native"`，否则会出现 "尚未设置 --jsx" 错误
2. **路径别名**: 使用 `@/*` 作为项目根目录的别名，便于导入
3. **严格模式**: 保持 `"strict": true` 启用所有严格类型检查

## 📝 常见问题

**问题**: 模块已解析但提示 "尚未设置 --jsx"  
**解决**: 在 `compilerOptions` 中添加 `"jsx": "react-native"`

**问题**: 路径别名不生效  
**解决**: 确保 `paths` 配置正确，且 VSCode/编辑器已重启
