# @jcc/shared/utils 0.1.0

不依赖 Vue 或 Ant。ESM 命名导出，浏览器下载相关函数仅调用时访问 DOM。

| 方法                                                    | 用途与边界                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| listToTree(items,{idKey,parentKey,childrenKey})         | 扁平转树；默认 id/parentId/children；孤儿为根，不修改输入；主键 0 有效，重复/循环抛错 |
| normalizeTree(nodes,{label,value,children})             | 统一字段为 title/key/value/children，不修改输入                                       |
| filterTree(nodes,keyword,{labelKey,childrenKey})        | 保留祖先，父命中保留分支                                                              |
| getTreeKeys(nodes) / findTreeNode(nodes,value,valueKey) | 遍历规范树和查询节点                                                                  |
| validateFile(file,{accept,maxSizeMB})                   | 返回 {valid,error}；支持后缀/MIME/通配，默认 10MB                                     |
| safeFileName(name)                                      | 清除路径和文件名非法字符                                                              |
| getDownloadName(contentDisposition,fallback)            | 优先 UTF-8 filename\*，再 filename，最后 fallback                                     |
| downloadBlob(blob,filename)                             | 触发浏览器下载，稍后释放 Blob URL                                                     |
| formatBytes(value)                                      | B/KB/MB/GB/TB；0 与缺失分开                                                           |
| formatDate(value,{dateOnly,locale,timeZone})            | 显示格式；默认浏览器时区，可指定 Asia/Shanghai                                        |
| cloneQuery(value)                                       | JSON 可序列化筛选值克隆，不处理函数/DOM/ref                                           |
| debounce(fn,delay)                                      | 防抖函数，提供 cancel()                                                               |

## createHttpClient({baseURL,fetch,getHeaders,onUnauthorized})

返回 request(path,{method,query,body,headers,signal,responseType,...fetchOptions})。
responseType 为 json（默认）、text、blob 或 response。204 返回 null；HTTP 错误抛 HttpError（status/details/message）。
query 数组使用重复键；保留 0/false，省略 null/undefined。JSON body 自动序列化；FormData 不自行设置边界。
getHeaders 可异步获取最新鉴权信息；组件库不存 token。已有 Axios 等客户端可继续使用，无需强制替换。
请求路径和 baseURL 由应用维护，不向任意外部 URL 传入鉴权头。API 示例不代表真实后端协议。
