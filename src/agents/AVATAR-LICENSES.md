# 头像作品与许可

核读日期：2026-09-29。头像方案沿用 Greenroom 的本地 DiceBear 生成方式。所有风格按需加载本机打包文件，不调用 DiceBear 头像服务；用户上传的图片只存入本机资料目录。

代码依赖为 `@dicebear/core` 9.4.3，以下 10 个风格包均为 9.4.2。包内非设计代码采用 MIT；设计许可必须分别判断，不能统一写成 CC0。

| 风格 / 包 | 设计者与原作品 | 设计许可 |
| --- | --- | --- |
| Pixel Art / `pixel-art` | [DiceBear](https://www.figma.com/community/file/1198754108850888330) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Notionists / `notionists` | [Zoish](https://heyzoish.gumroad.com/l/notionists) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Open Peeps / `open-peeps` | [Pablo Stanley](https://www.openpeeps.com/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Lorelei / `lorelei` | [Lisa Wischofsky](https://www.figma.com/community/file/1198749693280469639) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Micah / `micah` | [Micah Lanier, Avatar Illustration System](https://www.figma.com/community/file/829741575478342595) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Adventurer / `adventurer` | [Lisa Wischofsky](https://www.figma.com/community/file/1184595184137881796) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Avataaars / `avataaars` | [Pablo Stanley](https://avataaars.com/) | 原作品允许个人与商业使用；包内未标为 CC0。 |
| Bottts / `bottts` | [Pablo Stanley](https://bottts.com/) | 原作品允许个人与商业使用；包内未标为 CC0。 |
| Thumbs / `thumbs` | [DiceBear](https://www.dicebear.com) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Shapes / `shapes` | [DiceBear](https://www.dicebear.com) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

本应用通过 DiceBear 的风格算法，以角色 ID 为种子组合生成 SVG，设定 80 像素输出、透明背景，再由界面容器调整显示尺寸与圆角。未宣称设计作品为本应用原创。头像编辑器对当前选中风格显示设计者、原作品及许可链接；尤其保留 Micah 与 Adventurer 的署名。用户上传图片的权利不由 DiceBear 许可证授予。

许可依据是各安装包内 `LICENSE` 的 Design / Code 分项，而非评论中对所有 DiceBear 风格的概括。发布包应同时保留相应依赖的完整许可文件。

## DiceBear 代码 MIT 许可

MIT License

Copyright (c) 2024 Florian Körner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
