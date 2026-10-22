# data/ 数据目录

本目录包含静态站点使用的 1912—1936 年结构化日记数据，无需构建。

## 文件

- `years/index.json`：25 个年份的覆盖范围、日条数、来源记录 ID 与状态。
- `years/1912.json` … `years/1936.json`：逐年日条、附录、月份来源与元数据。

合计 **25 个年份、8,589 条日条、23 份附录**。

## 日条结构

```json
{
  "date": "YYYY-MM-DD",
  "original_text": "……",
  "heading": "……",
  "source": {
    "name": "北京鲁迅博物馆（北京新文化运动纪念馆）资料查询在线检索系统",
    "url": "……",
    "record_id": 0,
    "month_record": "……"
  }
}
```

`metadata` 包含月份来源、页面哈希、覆盖范围和文本异常统计；页面的年份懒加载只依赖 `days`、`appendices` 和索引中的覆盖信息。

## 加载方式

`app.js` 首先请求：

```text
data/years/index.json
```

然后按当前年份请求：

```text
data/years/1926.json
```

在 GitHub Pages 仓库子路径 `/luxun-diary/` 下，请求会自动解析为：

```text
/luxun-diary/data/years/1926.json
```

## 权利说明

数据不是 MIT 许可范围。详见仓库根目录 `DATA_NOTICE.md`。
