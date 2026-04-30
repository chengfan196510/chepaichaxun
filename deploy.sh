#!/bin/bash

# Vercel部署脚本

echo "🚀 开始部署到Vercel..."

# 检查是否安装了Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ 未找到Vercel CLI，正在安装..."
    npm install -g vercel
fi

# 检查是否已登录
echo "📋 检查登录状态..."
if ! vercel whoami &> /dev/null; then
    echo "⚠️  请先登录Vercel:"
    vercel login
fi

# 部署
echo "📦 开始部署..."
vercel --prod

echo "✅ 部署完成！"
