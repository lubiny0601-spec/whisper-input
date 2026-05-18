<p align="center">
  <img src="./public/AppIcon.png" width="96" height="96" alt="Whisper Input Logo" />
</p>

<h1 align="center">轻语输入 / Whisper Input</h1>

<p align="center">
  Windows AI 语音输入工具：把口语变成可以直接发送、提交和交接的文字。
</p>

<p align="center">
  <a href="https://github.com/EthanYoQ/whisper-input/releases"><img src="https://img.shields.io/github/v/release/EthanYoQ/whisper-input?label=release" alt="Release" /></a>
  <a href="https://github.com/EthanYoQ/whisper-input/blob/main/LICENSE"><img src="https://img.shields.io/github/license/EthanYoQ/whisper-input" alt="License" /></a>
  <a href="https://github.com/EthanYoQ/whisper-input/stargazers"><img src="https://img.shields.io/github/stars/EthanYoQ/whisper-input?style=social" alt="GitHub stars" /></a>
</p>

---

## 轻语输入是什么

轻语输入是一款面向 Windows 职场用户的 AI 语音输入工具。

它不是传统 IME，也不是会议记录软件。它只做一件事：当你按下快捷键说话时，把你刚说的内容整理成可用文字，并尽快插入到当前光标位置。

你可以用它写：

- 微信、飞书、企业微信消息
- 邮件、客户沟通、老板汇报
- 需求文档、日报、周报、交接文档
- GitHub Issue、PR 描述、README、技术反馈
- 中文口述生成英文文本

轻语输入的目标不是“生成内容”，而是让你说过的话变得更清楚、更正式、更容易直接使用。

## 为什么需要它

普通语音输入只负责把声音转成文字，但真实口述通常有停顿、重复、改口和口头语：

```text
嗯那个帮我记一下，今天主要有几个事，第一个是把这几次更新推送到 GitHub 并合并到 main，
第二个是 README 要改一下，要参考 Openless 的结构，但我们这个产品主要是给职场员工用的，
所以要突出正式输入、中文转英文和数字格式化这些能力。
```

轻语输入希望得到的是：

```text
本次需要完成以下事项：

1. 代码更新
1.1 将近期更新推送至 GitHub。
1.2 合并到 main 分支。

2. README 改写
2.1 参考 Openless 的文档结构和段落组织方式。
2.2 根据轻语输入的实际定位调整内容。

3. 产品重点
3.1 面向职场员工的高频输入场景。
3.2 突出正式表达、中文口述转英文，以及数字格式化输出等能力。
```

你只负责说，它负责整理。

## 核心功能

| 功能 | 说明 |
| --- | --- |
| 中文语音输入 | 面向中文为主、夹杂英文术语的真实工作场景 |
| AI 润色 | 去掉口头语、重复词和明显口误，自动补标点 |
| 清晰结构 | 将多个事项整理为 `1.`、`1.1`、`2.` 这样的层级结构 |
| 正式表达 | 将口述内容整理成正式邮件、请示、问题反馈、工作说明或交接文档 |
| 中文转英文 | 用中文说意思，直接输出英文邮件、Issue 或工作沟通文本 |
| 数字与格式整理 | 优化金额、时间、编号、中英文空格和常见标点 |
| 用户词典 | 保存常用人名、产品名、公司名和专业术语 |
| 历史记录 | 本地保存最近输入，方便回看、复制和删除 |
| 插入兜底 | 当前输入框插入失败时，自动复制到剪贴板 |

## 四种输出风格

### 原文

只做基础断句和标点修正，尽量保留原始表达。

适合临时记录、聊天、保留口语语气的场景。

### 轻度润色

删除“呃、那个、就是说、然后”等口头语，合并重复词，补标点，但不改变结构。

适合微信、飞书、日常工作沟通。

### 清晰结构

把多个点整理成层级编号。

适合任务清单、会议要点、需求拆解、问题复盘。

### 正式表达

把口语转换成正式邮件、公文式说明、问题反馈或工作交接文本。

适合给老板汇报、对客户说明、写交接文档、写正式反馈。

## 示例：同一段话，不同输出

原始口述：

```text
老板那个项目验收我刚才说错了不是周二是周三下午两点，然后麻烦你看一下合同和付款节点，还有测试这个地方要改一下。
```

轻度润色：

```text
老板，项目验收时间我刚才说错了，不是周二，是周三下午两点。麻烦你看一下合同和付款节点，还有测试这个地方要改一下。
```

清晰结构：

```text
老板，项目验收需要调整以下事项：

1. 时间更正
1.1 项目验收时间不是周二，而是周三下午两点。

2. 待确认事项
2.1 麻烦查看合同和付款节点。
2.2 测试部分需要调整。
```

正式表达：

```text
老板您好：

关于项目验收事项，现同步如下：

1. 验收时间更正
项目验收时间此前表述有误，现更正为周三下午两点。

2. 待确认事项
烦请您查看合同及付款节点；此外，测试部分还需要进一步调整。

谢谢。
```

## 中文说话，英文输出

你可以用中文说：

```text
帮我写一段英文，说我们已经完成了这次更新，主要修复了语音长文本截断的问题，并且优化了正式表达模式。
```

输出：

```text
We have completed this update. The main changes include fixing the issue where long voice input could be truncated, and improving the Formal style so that spoken content is converted into a more structured and professional format.
```

不用先在脑子里翻译，也不用一边想英文一边打字。

## 推荐模型配置

轻语输入是 cloud-first 产品。你需要配置自己的云端 ASR 和 LLM API Key。

| 类型 | 推荐 |
| --- | --- |
| 默认语音识别 | 千问实时 ASR |
| 备用语音识别 | 豆包流式语音识别 2.0 |
| 默认 AI 润色 | 千问 / Gemini / 豆包 |
| 低成本模式 | 轻量 LLM 模型 |

设置界面会内置常用模型和调用路径。普通用户只需要选择服务商并填写 API Key。

## 成本

轻语输入使用你自己的 API Key。

在轻量日常使用场景下，语音识别和文本润色成本通常可以控制在每月一两元人民币级别，具体费用取决于你选择的模型、语音时长和服务商计费规则。

相比 Typeless 这类订阅制语音输入工具，轻语输入更适合愿意自己配置 API Key、希望长期低成本使用的用户。

## 安装

1. 打开 [Releases](https://github.com/EthanYoQ/whisper-input/releases)。
2. 下载最新版 Windows 安装包。
3. 安装并启动轻语输入。
4. 进入“设置 - 模型设置”。
5. 选择千问或豆包方案，填写对应 API Key。
6. 按全局快捷键开始说话。

## 隐私说明

轻语输入不是离线语音识别工具。

- 录音音频会发送到你配置的云端语音识别服务。
- 识别后的文本会发送到你配置的 AI 润色模型。
- 历史记录和词汇表默认保存在本机。
- 你可以在设置中清空历史记录、词汇表和 API 配置。

## 产品边界

轻语输入不做这些事情：

- 不注册 Windows 系统输入法
- 不做传统 IME
- 不做会议记录工具
- 不做聊天机器人
- 不做 RAG / Agent
- 不以本地 ASR 模型作为默认路线

## 与 OpenLess 的关系

轻语输入基于 [OpenLess](https://github.com/Open-Less/openless) 改造而来。

感谢 OpenLess 作者和贡献者在桌面语音输入、全局快捷键、录音状态、文本插入和 Tauri 应用基础设施方面打下的基础。轻语输入在此基础上转向 Windows cloud-first 路线，更聚焦中文职场语音输入、正式表达、中文转英文和低成本 API 使用体验。

## Star

如果这个项目对你有帮助，欢迎前往 GitHub 点亮 Star，支持继续迭代。

## License

MIT
