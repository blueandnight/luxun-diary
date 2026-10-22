# data/ 数据目录

本公开仓库**不包含**完整日记数据。

页面代码期望的完整数据结构：

```text
data/
└─ years/
   ├─ index.json
   ├─ 1912.json
   ├─ 1913.json
   ├─ …
   └─ 1936.json
```

单个年份文件的 `days` 中，每条日条大致包含：

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

`data/years/index.json` 提供年份索引、首末日期、日条数和覆盖状态。页面按相对路径加载这些文件。

当前目录只有本说明文件。没有完整年份 JSON 时，页面会进入数据载入失败状态；这是公开代码版的预期行为，不是可用的完整站点。

数据版权与转载条件见仓库根目录 `DATA_NOTICE.md`。不要把未授权数据直接复制进本仓库。
