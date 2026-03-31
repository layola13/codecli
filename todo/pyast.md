这是一个更宏大的想法：

把任意语言的代码库，统一翻译成一个"语言无关的逻辑骨架 Python 工程"，所有函数调用关系、模块依赖都保留，但实现细节全部抹掉。

核心设计
任意语言代码库（TS/JS/Rust/C++/Go...）
    ↓ tree-sitter 解析（支持 40+ 语言）
统一 AST 中间表示（语言无关）
    ↓ 骨架生成器
skeleton/ 目录（镜像原工程结构）
    ├── src/
    │   ├── services/
    │   │   ├── order_service.py      ← 原来是 order_service.ts
    │   │   └── payment_service.py    ← 原来是 payment_service.rs
    │   └── api/
    │       └── routes.py             ← 原来是 routes.cpp
    └── main.py                       ← 原来是 main.go
骨架文件长什么样
原始 TypeScript：


// order_service.ts (300行)
export class OrderService {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly db: Database
  ) {}
  async createOrder(userId: string, cart: Cart): Promise<Order> {
    const validated = await this.cartService.validate(cart);
    const price = this.pricingService.calculate(validated);
    const order = new Order(userId, validated, price);
    await this.db.save(order);
    await this.eventBus.publish('order.created', order);
    return order;
  }
  async cancelOrder(orderId: string): Promise<Result<boolean, OrderError>> {
    // ... 50行复杂实现
  }
}
生成的骨架：


# skeleton/src/services/order_service.py
# source: src/services/order_service.ts [lang: typescript]
class OrderService:
    # depends_on: PaymentService, Database, CartService, PricingService, EventBus
    def __init__(self, paymentService: PaymentService, db: Database): ...
    async def createOrder(userId: str, cart: Cart) -> Order:
        # calls: CartService.validate, PricingService.calculate, db.save, EventBus.publish
        # source_line: 10-22
        ...
    async def cancelOrder(orderId: str) -> Result[bool, OrderError]:
        # calls: self.getOrder, PaymentService.refund, db.update
        # raises: OrderNotFoundError, PaymentError
        # source_line: 24-74
        ...
原始 Rust：


// payment_service.rs (200行)
impl PaymentService {
    pub async fn refund(&self, order_id: &str, amount: Decimal) 
        -> Result<Receipt, PaymentError> {
        let tx = self.stripe.refund(order_id, amount).await?;
        self.log_transaction(&tx).await?;
        Ok(Receipt::from(tx))
    }
}
生成骨架：


# skeleton/src/services/payment_service.py
# source: src/payment_service.rs [lang: rust]
class PaymentService:
    async def refund(order_id: str, amount: Decimal) -> Result[Receipt, PaymentError]:
        # calls: StripeClient.refund, self.log_transaction
        # source_line: 5-11
        ...
    async def log_transaction(tx: Transaction) -> None:
        # calls: db.insert, EventBus.publish
        # source_line: 13-18
        ...
大模型拿到整个 skeleton/ 工程，就能完整推理跨语言、跨文件的调用链。

工具设计（作为 Skill）
.cursor/skills/
└── polyglot-skeleton/
    ├── SKILL.md
    └── scripts/
        ├── build_skeleton.py     # 主入口
        ├── parsers/
        │   ├── base.py           # 抽象接口
        │   ├── typescript.py     # TS/JS 解析
        │   ├── rust.py           # Rust 解析
        │   ├── cpp.py            # C/C++ 解析
        │   └── generic.py        # 其他语言 fallback
        └── emitter.py            # 统一输出 .py 骨架
build_skeleton.py

import sys
from pathlib import Path
from parsers import get_parser
from emitter import emit_skeleton
LANG_MAP = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".rs": "rust",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp", ".hpp": "cpp",
    ".go": "go",
    ".java": "java",
    ".cs": "csharp",
    ".py": "python",
    ".rb": "ruby",
    ".swift": "swift",
    ".kt": "kotlin",
}
IGNORE_DIRS = {
    "__pycache__", ".venv", "node_modules", "target",
    "dist", "build", ".git", "vendor"
}
def build(root: Path, output: Path):
    output.mkdir(parents=True, exist_ok=True)
    
    for src_file in sorted(root.rglob("*")):
        if not src_file.is_file():
            continue
        if any(p in src_file.parts for p in IGNORE_DIRS):
            continue
        
        lang = LANG_MAP.get(src_file.suffix)
        if not lang:
            continue
        # 镜像原始目录结构
        rel = src_file.relative_to(root)
        skeleton_path = output / rel.with_suffix(".py")
        skeleton_path.parent.mkdir(parents=True, exist_ok=True)
        parser = get_parser(lang)
        try:
            ir = parser.parse(src_file)          # → 统一中间表示
            skeleton = emit_skeleton(ir, src_file, lang)
            skeleton_path.write_text(skeleton)
        except Exception as e:
            print(f"[skip] {src_file}: {e}")
    print(f"Skeleton built → {output}")
if __name__ == "__main__":
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    build(root, root / ".cursor/skeleton")
parsers/base.py — 统一中间表示（IR）

from dataclasses import dataclass, field
@dataclass
class ParamIR:
    name: str
    type: str = "Any"
@dataclass
class FunctionIR:
    name: str
    params: list[ParamIR] = field(default_factory=list)
    returns: str = "None"
    calls: list[str] = field(default_factory=list)   # 调用了谁
    raises: list[str] = field(default_factory=list)  # 可能抛出什么
    decorators: list[str] = field(default_factory=list)
    is_async: bool = False
    is_public: bool = True
    source_lines: tuple[int, int] = (0, 0)
@dataclass
class ClassIR:
    name: str
    bases: list[str] = field(default_factory=list)   # 继承/实现
    depends_on: list[str] = field(default_factory=list) # 构造注入的依赖
    methods: list[FunctionIR] = field(default_factory=list)
@dataclass
class ModuleIR:
    source_path: str
    lang: str
    imports: list[str] = field(default_factory=list)  # import 了谁
    classes: list[ClassIR] = field(default_factory=list)
    functions: list[FunctionIR] = field(default_factory=list)
parsers/typescript.py

import tree_sitter_typescript as tst
from tree_sitter import Language, Parser
from .base import ModuleIR, ClassIR, FunctionIR, ParamIR
TS_LANG = Language(tst.language_typescript())
class TypeScriptParser:
    def __init__(self):
        self.parser = Parser(TS_LANG)
    def parse(self, file: Path) -> ModuleIR:
        source = file.read_bytes()
        tree = self.parser.parse(source)
        src = source.decode("utf-8")
        ir = ModuleIR(source_path=str(file), lang="typescript")
        self._extract_imports(tree.root_node, src, ir)
        self._extract_classes(tree.root_node, src, ir)
        self._extract_functions(tree.root_node, src, ir)
        return ir
    def _extract_imports(self, root, src, ir):
        for node in self._find_all(root, "import_statement"):
            ir.imports.append(self._node_text(node, src))
    def _extract_classes(self, root, src, ir):
        for node in self._find_all(root, "class_declaration"):
            cls = ClassIR(name=self._get_name(node, src))
            
            # 继承
            heritage = self._find_first(node, "class_heritage")
            if heritage:
                cls.bases = self._extract_type_names(heritage, src)
            
            # 构造函数参数 → depends_on
            ctor = self._find_constructor(node)
            if ctor:
                cls.depends_on = self._extract_di_params(ctor, src)
            
            # 方法
            for method_node in self._find_all(node, "method_definition"):
                fn = self._extract_function(method_node, src)
                if fn:
                    cls.methods.append(fn)
            
            ir.classes.append(cls)
    def _extract_function(self, node, src) -> FunctionIR | None:
        name_node = node.child_by_field_name("name")
        if not name_node:
            return None
        
        fn = FunctionIR(
            name=self._node_text(name_node, src),
            is_async="async" in self._node_text(node, src)[:20],
            source_lines=(node.start_point[0], node.end_point[0]),
        )
        
        # 参数
        params_node = node.child_by_field_name("parameters")
        if params_node:
            fn.params = self._extract_params(params_node, src)
        
        # 返回类型
        ret_node = node.child_by_field_name("return_type")
        fn.returns = self._node_text(ret_node, src).lstrip(": ") if ret_node else "void"
        
        # 调用链（遍历函数体）
        body = node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_calls(body, src)
        
        return fn
    def _extract_calls(self, body_node, src) -> list[str]:
        calls = []
        for node in self._find_all(body_node, "call_expression"):
            func_node = node.child_by_field_name("function")
            if func_node:
                call_text = self._node_text(func_node, src)
                # 过滤掉太长或匿名的调用
                if len(call_text) < 60 and call_text not in calls:
                    calls.append(call_text)
        return calls
    def _find_all(self, node, type_name):
        results = []
        if node.type == type_name:
            results.append(node)
        for child in node.children:
            results.extend(self._find_all(child, type_name))
        return results
    def _node_text(self, node, src):
        return src[node.start_byte:node.end_byte]
emitter.py — IR → Python 骨架

from parsers.base import ModuleIR
def emit_skeleton(ir: ModuleIR, src_file: Path, lang: str) -> str:
    lines = [
        f"# source: {src_file} [lang: {lang}]",
        f"# {'─' * 60}",
        "",
    ]
    if ir.imports:
        lines.append(f"# imports: {', '.join(_shorten_imports(ir.imports))}")
        lines.append("")
    for cls in ir.classes:
        if cls.bases:
            lines.append(f"class {cls.name}({', '.join(cls.bases)}):")
        else:
            lines.append(f"class {cls.name}:")
        if cls.depends_on:
            lines.append(f"    # depends_on: {', '.join(cls.depends_on)}")
            lines.append("")
        for fn in cls.methods:
            _emit_function(fn, lines, indent="    ")
            lines.append("")
        lines.append("")
    for fn in ir.functions:
        _emit_function(fn, lines, indent="")
        lines.append("")
    return "\n".join(lines)
def _emit_function(fn, lines, indent):
    if fn.decorators:
        for d in fn.decorators:
            lines.append(f"{indent}@{d}")
    async_prefix = "async " if fn.is_async else ""
    params = ", ".join(
        f"{p.name}: {p.type}" if p.type != "Any" else p.name
        for p in fn.params
    )
    lines.append(f"{indent}{async_prefix}def {fn.name}({params}) -> {fn.returns}:")
    if fn.calls:
        lines.append(f"{indent}    # calls: {', '.join(fn.calls)}")
    if fn.raises:
        lines.append(f"{indent}    # raises: {', '.join(fn.raises)}")
    lines.append(f"{indent}    # source_line: {fn.source_lines[0]}-{fn.source_lines[1]}")
    lines.append(f"{indent}    ...")
最终效果
一个混合语言项目（TS 前端 + Rust 后端 + C++ 核心库）：

skeleton/
├── frontend/
│   ├── src/
│   │   ├── pages/checkout.py        # ← checkout.tsx
│   │   └── services/payment.py      # ← payment.ts
├── backend/
│   ├── src/
│   │   ├── order_service.py         # ← order_service.rs
│   │   └── payment_service.py       # ← payment_service.rs
└── core/
    └── engine.py                    # ← engine.cpp
大模型 @skeleton/ 整个目录加入 context，几乎不消耗 token，但能完整推理：

跨语言调用链：TS 前端 → Rust 后端 → C++ 核心
影响域：修改 engine.cpp 里某个函数，哪些 Rust/TS 代码受影响
重构范围：接口变更需要改哪些文件
再配合 # source_line: 87-134，大模型需要看具体实现时，精确 read_file 到对应行，不需要读整个文件。

作为 Skill 的 SKILL.md

---
name: polyglot-skeleton
description: 将任意语言代码库（TS/JS/Rust/C++/Go等）转换为统一的Python骨架工程，
  保留函数签名、调用关系、依赖结构，抹去实现细节。Use when analyzing cross-file
  or cross-language call chains, impact of refactoring, understanding project
  structure, or before making changes that span multiple files.
---
## Instructions
1. 生成骨架：
   `python scripts/build_skeleton.py <project_root>`
   输出到 `.cursor/skeleton/`
2. 将整个 


# 完整实现：polyglot-skeleton

下面补全所有文件，包括被截断的 `SKILL.md`、缺失的解析器、辅助函数、以及完整的工程脚手架。

---

## 1. `SKILL.md`（完整版）

```markdown
---
name: polyglot-skeleton
description: 将任意语言代码库（TS/JS/Rust/C++/Go等）转换为统一的Python骨架工程，
  保留函数签名、调用关系、依赖结构，抹去实现细节。Use when analyzing cross-file
  or cross-language call chains, impact of refactoring, understanding project
  structure, or before making changes that span multiple files.
---

## Instructions

1. 生成骨架：
   ```bash
   python scripts/build_skeleton.py <project_root>
   ```
   输出到 `.cursor/skeleton/`

2. 将整个 `skeleton/` 目录加入上下文：
   ```
   @.cursor/skeleton/
   ```
   这会给你一个极低 token 开销的全局视图：每个文件的类、函数签名、
   调用链（calls）、依赖（depends_on）、源码行号（source_line）。

3. 当需要查看具体实现时，利用骨架中的 `# source_line: 87-134` 注释，
   精确读取原始文件对应行：
   ```
   read_file src/services/order_service.rs lines=87-134
   ```

4. 增量更新：修改原始文件后重新运行即可，骨架会自动覆盖。
   也可以只更新单个文件：
   ```bash
   python scripts/build_skeleton.py <project_root> --file src/services/order_service.rs
   ```

## When to Use

- **理解项目结构**：首次接触一个陌生代码库，先生成骨架再阅读
- **跨文件调用链追踪**：某个函数被谁调用？改了它会影响哪些文件？
- **跨语言依赖分析**：TS 前端 → Rust 后端 → C++ 核心，完整链路一目了然
- **重构影响评估**：接口签名变更，哪些下游需要同步修改？
- **Code Review 辅助**：快速理解一个 PR 涉及的调用链全貌
- **文档生成**：基于骨架自动生成模块依赖图、API 索引

## Supported Languages

| 语言 | 扩展名 | 解析器 | 覆盖度 |
|------|--------|--------|--------|
| TypeScript/TSX | `.ts` `.tsx` | tree-sitter-typescript | ★★★★★ |
| JavaScript/JSX | `.js` `.jsx` | tree-sitter-javascript | ★★★★★ |
| Rust | `.rs` | tree-sitter-rust | ★★★★★ |
| C/C++ | `.c` `.cpp` `.cc` `.h` `.hpp` | tree-sitter-cpp | ★★★★☆ |
| Go | `.go` | tree-sitter-go | ★★★★☆ |
| Python | `.py` | tree-sitter-python | ★★★★★ |
| Java | `.java` | tree-sitter-java | ★★★★☆ |
| C# | `.cs` | tree-sitter-c-sharp | ★★★☆☆ |
| Ruby | `.rb` | tree-sitter-ruby | ★★★☆☆ |
| Swift | `.swift` | tree-sitter-swift | ★★★☆☆ |
| Kotlin | `.kt` | tree-sitter-kotlin | ★★★☆☆ |

不在列表中的语言会使用 `generic` 解析器（基于正则 + 启发式），
能提取基本的函数/类签名，但调用链精度较低。

## Output Format

每个骨架文件遵循统一格式：
```python
# source: <原始文件路径> [lang: <语言>]
# ──────────────────────────────────────────────────────────────

# imports: <导入列表摘要>

class ClassName(BaseClass):
    # depends_on: Dep1, Dep2, Dep3

    async def method_name(param1: Type1, param2: Type2) -> ReturnType:
        # calls: Service.method, db.query, EventBus.publish
        # raises: NotFoundError, ValidationError
        # source_line: 87-134
        ...
```

## Cross-Reference Index

骨架生成完成后，会同时输出 `_index.py`：
```python
# .cursor/skeleton/_index.py
# Auto-generated cross-reference index
CALL_GRAPH = {
    "OrderService.createOrder": ["CartService.validate", "PricingService.calculate", "Database.save"],
    "PaymentService.refund": ["StripeClient.refund", "PaymentService.log_transaction"],
    ...
}
REVERSE_DEPS = {
    "Database.save": ["OrderService.createOrder", "UserService.register", ...],
    ...
}
FILE_MAP = {
    "OrderService": "src/services/order_service.rs",
    "PaymentService": "src/services/payment_service.rs",
    ...
}
```

## Limitations

- 动态调用（反射、eval、函数指针）无法静态分析
- 宏展开（Rust macro、C++ template）的调用链可能不完整
- 泛型/模板的具体类型实例化不会追踪
- 闭包/lambda 内的调用归属到包含它的外层函数
```

---

## 2. `parsers/__init__.py`

```python
"""
解析器注册表：根据语言名称返回对应的解析器实例。
"""

from pathlib import Path
from .base import ModuleIR

# 延迟导入避免未安装某些 tree-sitter 语言包时直接报错
_PARSER_CACHE: dict[str, object] = {}

# 哪些语言使用哪个解析器类
_PARSER_CLASSES = {
    "typescript": ("parsers.typescript", "TypeScriptParser"),
    "javascript": ("parsers.javascript", "JavaScriptParser"),
    "rust":       ("parsers.rust",       "RustParser"),
    "cpp":        ("parsers.cpp",        "CppParser"),
    "c":          ("parsers.cpp",        "CppParser"),
    "go":         ("parsers.go_lang",    "GoParser"),
    "python":     ("parsers.python_lang","PythonParser"),
    "java":       ("parsers.java",       "JavaParser"),
    "csharp":     ("parsers.csharp",     "CSharpParser"),
    "ruby":       ("parsers.ruby",       "RubyParser"),
    "swift":      ("parsers.swift",      "SwiftParser"),
    "kotlin":     ("parsers.kotlin",     "KotlinParser"),
}


def get_parser(lang: str):
    """
    返回指定语言的解析器实例。
    如果该语言没有专用解析器或 tree-sitter 语言包未安装，回退到 GenericParser。
    """
    if lang in _PARSER_CACHE:
        return _PARSER_CACHE[lang]

    if lang in _PARSER_CLASSES:
        module_path, class_name = _PARSER_CLASSES[lang]
        try:
            import importlib
            mod = importlib.import_module(module_path)
            parser_cls = getattr(mod, class_name)
            parser = parser_cls()
            _PARSER_CACHE[lang] = parser
            return parser
        except (ImportError, AttributeError, OSError) as e:
            print(f"[warn] {lang} 专用解析器加载失败 ({e})，回退到 generic")

    # Fallback
    from .generic import GenericParser
    parser = GenericParser(lang)
    _PARSER_CACHE[lang] = parser
    return parser
```

---

## 3. `parsers/base.py`（补全 `TreeSitterBase` 基类）

```python
"""
统一中间表示（IR）+ tree-sitter 解析器基类。
所有专用解析器继承 TreeSitterBase，只需覆写提取逻辑。
"""

from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ─── 中间表示 ─────────────────────────────────────────────────

@dataclass
class ParamIR:
    name: str
    type: str = "Any"


@dataclass
class FunctionIR:
    name: str
    params: list[ParamIR] = field(default_factory=list)
    returns: str = "None"
    calls: list[str] = field(default_factory=list)
    raises: list[str] = field(default_factory=list)
    decorators: list[str] = field(default_factory=list)
    is_async: bool = False
    is_public: bool = True
    is_static: bool = False
    is_constructor: bool = False
    source_lines: tuple[int, int] = (0, 0)
    docstring: str = ""


@dataclass
class ClassIR:
    name: str
    bases: list[str] = field(default_factory=list)
    depends_on: list[str] = field(default_factory=list)
    methods: list[FunctionIR] = field(default_factory=list)
    fields: list[ParamIR] = field(default_factory=list)  # 类字段/属性
    is_abstract: bool = False
    source_lines: tuple[int, int] = (0, 0)


@dataclass
class EnumIR:
    name: str
    variants: list[str] = field(default_factory=list)
    source_lines: tuple[int, int] = (0, 0)


@dataclass
class ModuleIR:
    source_path: str
    lang: str
    imports: list[str] = field(default_factory=list)
    classes: list[ClassIR] = field(default_factory=list)
    enums: list[EnumIR] = field(default_factory=list)
    functions: list[FunctionIR] = field(default_factory=list)
    constants: list[str] = field(default_factory=list)
    module_doc: str = ""


# ─── tree-sitter 工具基类 ────────────────────────────────────

class TreeSitterBase:
    """
    所有 tree-sitter 解析器的公共基类，提供通用遍历工具。
    子类需要：
      1. 在 __init__ 中设置 self.parser (tree_sitter.Parser)
      2. 实现 parse(file: Path) -> ModuleIR
    """

    # ── 遍历工具 ──

    @staticmethod
    def find_all(node, type_name: str) -> list:
        """递归查找所有指定类型的节点。"""
        results = []
        if node.type == type_name:
            results.append(node)
        for child in node.children:
            results.extend(TreeSitterBase.find_all(child, type_name))
        return results

    @staticmethod
    def find_all_types(node, type_names: set[str]) -> list:
        """递归查找多种类型的节点。"""
        results = []
        if node.type in type_names:
            results.append(node)
        for child in node.children:
            results.extend(TreeSitterBase.find_all_types(child, type_names))
        return results

    @staticmethod
    def find_first(node, type_name: str):
        """查找第一个匹配的子节点（DFS）。"""
        if node.type == type_name:
            return node
        for child in node.children:
            found = TreeSitterBase.find_first(child, type_name)
            if found:
                return found
        return None

    @staticmethod
    def find_direct_children(node, type_name: str) -> list:
        """只在直接子节点中查找（不递归）。"""
        return [c for c in node.children if c.type == type_name]

    @staticmethod
    def node_text(node, src: str) -> str:
        """提取节点对应的源码文本。"""
        return src[node.start_byte:node.end_byte]

    @staticmethod
    def get_name(node, src: str) -> str:
        """通用名称提取：尝试 name 字段，否则取第一个 identifier 子节点。"""
        name_node = node.child_by_field_name("name")
        if name_node:
            return TreeSitterBase.node_text(name_node, src)
        for child in node.children:
            if child.type in ("identifier", "type_identifier", "property_identifier"):
                return TreeSitterBase.node_text(child, src)
        return "<anonymous>"

    @staticmethod
    def extract_calls(body_node, src: str) -> list[str]:
        """从函数体中提取所有函数调用。"""
        calls = []
        for node in TreeSitterBase.find_all(body_node, "call_expression"):
            func_node = node.child_by_field_name("function")
            if func_node:
                call_text = TreeSitterBase.node_text(func_node, src)
                # 清理：去掉 await/this.
                call_text = call_text.replace("await ", "")
                if len(call_text) < 80 and call_text not in calls:
                    calls.append(call_text)
        return calls

    @staticmethod
    def lines_of(node) -> tuple[int, int]:
        """返回节点的 (起始行, 结束行)，1-based。"""
        return (node.start_point[0] + 1, node.end_point[0] + 1)
```

---

## 4. `parsers/typescript.py`（补全所有缺失方法）

```python
"""
TypeScript / TSX 解析器。
同时处理 .ts 和 .tsx 文件。
"""

from __future__ import annotations
from pathlib import Path

try:
    import tree_sitter_typescript as tst
    from tree_sitter import Language, Parser as TSParser
    TS_LANG = Language(tst.language_typescript())
    TSX_LANG = Language(tst.language_tsx())
    HAS_TS = True
except ImportError:
    HAS_TS = False

from .base import ModuleIR, ClassIR, FunctionIR, ParamIR, EnumIR, TreeSitterBase


class TypeScriptParser(TreeSitterBase):

    def __init__(self):
        if not HAS_TS:
            raise ImportError("tree-sitter-typescript not installed")
        self.ts_parser = TSParser(TS_LANG)
        self.tsx_parser = TSParser(TSX_LANG)

    # ─── 主入口 ──────────────────────────────────────────────

    def parse(self, file: Path) -> ModuleIR:
        source = file.read_bytes()
        parser = self.tsx_parser if file.suffix == ".tsx" else self.ts_parser
        tree = parser.parse(source)
        src = source.decode("utf-8")

        ir = ModuleIR(source_path=str(file), lang="typescript")
        self._extract_imports(tree.root_node, src, ir)
        self._extract_enums(tree.root_node, src, ir)
        self._extract_classes(tree.root_node, src, ir)
        self._extract_top_functions(tree.root_node, src, ir)
        self._extract_top_variables(tree.root_node, src, ir)
        return ir

    # ─── Imports ─────────────────────────────────────────────

    def _extract_imports(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "import_statement"):
            text = self.node_text(node, src).strip()
            # 提取 from 后面的模块路径
            source_node = node.child_by_field_name("source")
            if source_node:
                module_path = self.node_text(source_node, src).strip("'\"")
                ir.imports.append(module_path)
            else:
                ir.imports.append(text)

    # ─── Enums ───────────────────────────────────────────────

    def _extract_enums(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "enum_declaration"):
            name = self.get_name(node, src)
            variants = []
            body = self.find_first(node, "enum_body")
            if body:
                for member in self.find_direct_children(body, "enum_member"):  
                    # 有的叫 property_identifier，有的叫 enum_assignment
                    variants.append(self.get_name(member, src))
            ir.enums.append(EnumIR(
                name=name,
                variants=variants,
                source_lines=self.lines_of(node),
            ))

    # ─── Classes ─────────────────────────────────────────────

    def _extract_classes(self, root, src: str, ir: ModuleIR):
        for node in self.find_all_types(root, {"class_declaration", "abstract_class_declaration"}):
            cls = ClassIR(
                name=self.get_name(node, src),
                is_abstract=node.type == "abstract_class_declaration",
                source_lines=self.lines_of(node),
            )

            # 继承 / 实现
            for heritage in self.find_all_types(node, {"extends_clause", "implements_clause"}):
                for type_node in self.find_all(heritage, "type_identifier"):
                    cls.bases.append(self.node_text(type_node, src))

            # 类体
            body = self.find_first(node, "class_body")
            if not body:
                ir.classes.append(cls)
                continue

            for child in body.children:
                if child.type == "method_definition":
                    fn = self._parse_method(child, src)
                    if fn:
                        if fn.is_constructor:
                            cls.depends_on = [p.type for p in fn.params if p.type != "Any"]
                        cls.methods.append(fn)

                elif child.type in ("public_field_definition", "property_definition"):
                    fname = self.get_name(child, src)
                    ftype = self._get_type_annotation(child, src)
                    cls.fields.append(ParamIR(name=fname, type=ftype))

            ir.classes.append(cls)

    def _parse_method(self, node, src: str) -> FunctionIR | None:
        name_node = node.child_by_field_name("name")
        if not name_node:
            return None

        name = self.node_text(name_node, src)
        fn = FunctionIR(
            name=name,
            is_constructor=(name == "constructor"),
            is_async=any(c.type == "async" for c in node.children),
            is_static=any(c.type == "static" for c in node.children),
            is_public=not any(
                self.node_text(c, src) in ("private", "protected")
                for c in node.children
                if c.type == "accessibility_modifier"
            ),
            source_lines=self.lines_of(node),
        )

        # 参数
        params_node = node.child_by_field_name("parameters")
        if params_node:
            fn.params = self._extract_params(params_node, src)

        # 返回类型
        ret_node = node.child_by_field_name("return_type")
        if ret_node:
            fn.returns = self._clean_type(self.node_text(ret_node, src))
        else:
            fn.returns = "None" if name == "constructor" else "Any"

        # 调用链
        body = node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_ts_calls(body, src)
            fn.raises = self._extract_throws(body, src)

        # 装饰器
        fn.decorators = self._extract_decorators(node, src)

        return fn

    # ─── 顶层函数 ────────────────────────────────────────────

    def _extract_top_functions(self, root, src: str, ir: ModuleIR):
        """提取模块级函数（不在 class 内部的）。"""
        for node in root.children:
            if node.type in ("function_declaration", "export_statement"):
                fn_node = node
                if node.type == "export_statement":
                    # export function foo() {}
                    fn_node = self.find_first(node, "function_declaration")
                    if not fn_node:
                        # export const foo = () => {}
                        fn_node = self.find_first(node, "lexical_declaration")
                        if fn_node:
                            arrow = self.find_first(fn_node, "arrow_function")
                            if arrow:
                                fn = self._parse_arrow_function(fn_node, arrow, src)
                                if fn:
                                    ir.functions.append(fn)
                        continue

                if fn_node and fn_node.type == "function_declaration":
                    fn = self._parse_function_decl(fn_node, src)
                    if fn:
                        ir.functions.append(fn)

    def _parse_function_decl(self, node, src: str) -> FunctionIR | None:
        name = self.get_name(node, src)
        fn = FunctionIR(
            name=name,
            is_async=any(c.type == "async" for c in node.children),
            source_lines=self.lines_of(node),
        )
        params_node = node.child_by_field_name("parameters")
        if params_node:
            fn.params = self._extract_params(params_node, src)
        ret_node = node.child_by_field_name("return_type")
        if ret_node:
            fn.returns = self._clean_type(self.node_text(ret_node, src))
        body = node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_ts_calls(body, src)
            fn.raises = self._extract_throws(body, src)
        fn.decorators = self._extract_decorators(node, src)
        return fn

    def _parse_arrow_function(self, decl_node, arrow_node, src: str) -> FunctionIR | None:
        # 从 lexical_declaration 中提取名称
        declarator = self.find_first(decl_node, "variable_declarator")
        if not declarator:
            return None
        name = self.get_name(declarator, src)
        fn = FunctionIR(
            name=name,
            is_async=any(c.type == "async" for c in arrow_node.children),
            source_lines=self.lines_of(decl_node),
        )
        params_node = arrow_node.child_by_field_name("parameters")
        if params_node:
            fn.params = self._extract_params(params_node, src)
        ret_node = arrow_node.child_by_field_name("return_type")
        if ret_node:
            fn.returns = self._clean_type(self.node_text(ret_node, src))
        body = arrow_node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_ts_calls(body, src)
        return fn

    # ─── 顶层常量 ────────────────────────────────────────────

    def _extract_top_variables(self, root, src: str, ir: ModuleIR):
        for node in root.children:
            target = node
            if node.type == "export_statement":
                target = self.find_first(node, "lexical_declaration") or node
            if target.type == "lexical_declaration":
                # 跳过已经作为箭头函数处理过的
                arrow = self.find_first(target, "arrow_function")
                if arrow:
                    continue
                for declarator in self.find_all(target, "variable_declarator"):
                    name = self.get_name(declarator, src)
                    ir.constants.append(name)

    # ─── 参数提取 ────────────────────────────────────────────

    def _extract_params(self, params_node, src: str) -> list[ParamIR]:
        params = []
        for child in params_node.children:
            if child.type in (
                "required_parameter", "optional_parameter",
                "formal_parameter", "parameter",
            ):
                pname = self.get_name(child, src)
                ptype = self._get_type_annotation(child, src)
                # 跳过 TypeScript 构造函数中的 accessibility modifier 前缀
                if pname in ("private", "public", "protected", "readonly"):
                    # 实际名称是下一个 identifier
                    ids = [c for c in child.children if c.type == "identifier"]
                    pname = self.node_text(ids[-1], src) if ids else pname
                params.append(ParamIR(name=pname, type=ptype))
        return params

    def _get_type_annotation(self, node, src: str) -> str:
        """提取 : Type 注解。"""
        ta = node.child_by_field_name("type")
        if ta:
            return self._clean_type(self.node_text(ta, src))
        # 也可能是 type_annotation 子节点
        ta = self.find_first(node, "type_annotation")
        if ta:
            return self._clean_type(self.node_text(ta, src))
        return "Any"

    # ─── 调用链提取 ──────────────────────────────────────────

    def _extract_ts_calls(self, body_node, src: str) -> list[str]:
        """提取函数体中的调用，包括 await 表达式内的。"""
        calls = []
        call_types = {"call_expression"}

        for node in self.find_all_types(body_node, call_types):
            func_node = node.child_by_field_name("function")
            if not func_node:
                continue

            call_text = self.node_text(func_node, src).strip()

            # 清理 this. → self.
            call_text = call_text.replace("this.", "self.")

            # 清理 await
            if call_text.startswith("await "):
                call_text = call_text[6:]

            # 跳过太长 / 匿名 / 纯表达式
            if len(call_text) > 80:
                continue
            if call_text.startswith("("):
                continue

            if call_text not in calls:
                calls.append(call_text)

        return calls

    def _extract_throws(self, body_node, src: str) -> list[str]:
        """提取 throw 语句中的异常类型。"""
        raises = []
        for node in self.find_all(body_node, "throw_statement"):
            # throw new FooError(...)
            new_expr = self.find_first(node, "new_expression")
            if new_expr:
                name = self.get_name(new_expr, src)
                if name not in raises:
                    raises.append(name)
            else:
                text = self.node_text(node, src).strip()
                if len(text) < 60 and text not in raises:
                    raises.append(text)
        return raises

    # ─── 装饰器 ──────────────────────────────────────────────

    def _extract_decorators(self, node, src: str) -> list[str]:
        decorators = []
        for child in node.children:
            if child.type == "decorator":
                dec_text = self.node_text(child, src).lstrip("@").strip()
                decorators.append(dec_text)
        return decorators

    # ─── 工具 ────────────────────────────────────────────────

    @staticmethod
    def _clean_type(text: str) -> str:
        """清理 TypeScript 类型标注为 Python 可读形式。"""
        text = text.strip().lstrip(": ").strip()

        # TS → Python 映射
        TYPE_MAP = {
            "string": "str",
            "number": "int | float",
            "boolean": "bool",
            "void": "None",
            "undefined": "None",
            "null": "None",
            "any": "Any",
            "unknown": "Any",
            "never": "NoReturn",
        }

        lower = text.lower()
        if lower in TYPE_MAP:
            return TYPE_MAP[lower]

        # Promise<T> → T  (骨架层面不需要 async 包装)
        if text.startswith("Promise<") and text.endswith(">"):
            inner = text[8:-1]
            return TypeScriptParser._clean_type(inner)

        # Array<T> → list[T]
        if text.startswith("Array<") and text.endswith(">"):
            inner = text[6:-1]
            return f"list[{TypeScriptParser._clean_type(inner)}]"

        # T[] → list[T]
        if text.endswith("[]"):
            inner = text[:-2]
            return f"list[{TypeScriptParser._clean_type(inner)}]"

        # Record<K, V> → dict[K, V]
        if text.startswith("Record<"):
            return text.replace("Record<", "dict[").rstrip(">") + "]"

        # Result<T, E> → Result[T, E]
        if "<" in text and ">" in text:
            base = text[:text.index("<")]
            inner = text[text.index("<")+1:text.rindex(">")]
            return f"{base}[{inner}]"

        return text
```

---

## 5. `parsers/javascript.py`

```python
"""
JavaScript / JSX 解析器。
复用 TypeScript 解析器大部分逻辑，只切换 tree-sitter 语言。
"""

from __future__ import annotations
from pathlib import Path

try:
    import tree_sitter_javascript as tsjs
    from tree_sitter import Language, Parser as TSParser
    JS_LANG = Language(tsjs.language())
    HAS_JS = True
except ImportError:
    HAS_JS = False

from .base import ModuleIR, TreeSitterBase
from .typescript import TypeScriptParser


class JavaScriptParser(TypeScriptParser):
    """
    JavaScript 解析器，继承 TypeScript 解析器。
    JS 是 TS 的子集，绝大多数提取逻辑通用。
    """

    def __init__(self):
        if not HAS_JS:
            raise ImportError("tree-sitter-javascript not installed")
        from tree_sitter import Parser as TSParser
        self.ts_parser = TSParser(JS_LANG)   # JS 没有 tsx 之分，但统一接口
        self.tsx_parser = self.ts_parser

    def parse(self, file: Path) -> ModuleIR:
        ir = super().parse(file)
        ir.lang = "javascript"
        return ir
```

---

## 6. `parsers/rust.py`

```python
"""
Rust 解析器：提取 struct / enum / impl / fn / trait。
"""

from __future__ import annotations
from pathlib import Path

try:
    import tree_sitter_rust as tsrs
    from tree_sitter import Language, Parser as TSParser
    RUST_LANG = Language(tsrs.language())
    HAS_RUST = True
except ImportError:
    HAS_RUST = False

from .base import (
    ModuleIR, ClassIR, FunctionIR, ParamIR, EnumIR, TreeSitterBase
)


class RustParser(TreeSitterBase):

    def __init__(self):
        if not HAS_RUST:
            raise ImportError("tree-sitter-rust not installed")
        self.parser = TSParser(RUST_LANG)

    def parse(self, file: Path) -> ModuleIR:
        source = file.read_bytes()
        tree = self.parser.parse(source)
        src = source.decode("utf-8")

        ir = ModuleIR(source_path=str(file), lang="rust")

        self._extract_use_declarations(tree.root_node, src, ir)
        self._extract_enums(tree.root_node, src, ir)
        self._extract_structs(tree.root_node, src, ir)
        self._extract_impls(tree.root_node, src, ir)
        self._extract_top_functions(tree.root_node, src, ir)

        return ir

    # ─── use 声明 ────────────────────────────────────────────

    def _extract_use_declarations(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "use_declaration"):
            text = self.node_text(node, src).strip().rstrip(";")
            # "use std::collections::HashMap" → "std::collections::HashMap"
            path = text.removeprefix("use ").removeprefix("pub use ")
            ir.imports.append(path)

    # ─── Enums ───────────────────────────────────────────────

    def _extract_enums(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "enum_item"):
            name = self.get_name(node, src)
            variants = []
            body = self.find_first(node, "enum_variant_list")
            if body:
                for v in self.find_all(body, "enum_variant"):
                    variants.append(self.get_name(v, src))
            ir.enums.append(EnumIR(
                name=name,
                variants=variants,
                source_lines=self.lines_of(node),
            ))

    # ─── Structs → ClassIR ───────────────────────────────────

    def _extract_structs(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "struct_item"):
            name = self.get_name(node, src)
            cls = ClassIR(
                name=name,
                source_lines=self.lines_of(node),
            )
            # 字段
            field_list = self.find_first(node, "field_declaration_list")
            if field_list:
                for field_node in self.find_all(field_list, "field_declaration"):
                    fname = self.get_name(field_node, src)
                    ftype = self._get_rust_type(field_node, src)
                    cls.fields.append(ParamIR(name=fname, type=ftype))
                    cls.depends_on.append(ftype)

            # 去重 depends_on，排除基本类型
            cls.depends_on = self._filter_deps(cls.depends_on)
            ir.classes.append(cls)

    # ─── impl 块 → methods ───────────────────────────────────

    def _extract_impls(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "impl_item"):
            # impl Foo { ... }  或  impl Trait for Foo { ... }
            type_node = node.child_by_field_name("type")
            if not type_node:
                continue
            struct_name = self.node_text(type_node, src).strip()

            # 查找对应的 ClassIR（如果已经从 struct 创建过）
            target_cls = None
            for cls in ir.classes:
                if cls.name == struct_name:
                    target_cls = cls
                    break
            if not target_cls:
                target_cls = ClassIR(name=struct_name, source_lines=self.lines_of(node))
                ir.classes.append(target_cls)

            # trait 实现？
            trait_node = node.child_by_field_name("trait")
            if trait_node:
                trait_name = self.node_text(trait_node, src).strip()
                if trait_name not in target_cls.bases:
                    target_cls.bases.append(trait_name)

            # 方法
            body = self.find_first(node, "declaration_list")
            if body:
                for fn_node in self.find_all(body, "function_item"):
                    fn = self._parse_rust_function(fn_node, src)
                    if fn:
                        target_cls.methods.append(fn)

    # ─── 顶层函数 ────────────────────────────────────────────

    def _extract_top_functions(self, root, src: str, ir: ModuleIR):
        for node in root.children:
            if node.type == "function_item":
                fn = self._parse_rust_function(node, src)
                if fn:
                    ir.functions.append(fn)

    # ─── 函数解析 ────────────────────────────────────────────

    def _parse_rust_function(self, node, src: str) -> FunctionIR | None:
        name = self.get_name(node, src)
        if not name or name == "<anonymous>":
            return None

        fn = FunctionIR(
            name=name,
            is_async=any(c.type == "async" for c in node.children),
            is_public=any(
                self.node_text(c, src).strip() == "pub"
                for c in node.children
                if c.type == "visibility_modifier"
            ),
            source_lines=self.lines_of(node),
        )

        # 参数
        params_node = node.child_by_field_name("parameters")
        if params_node:
            fn.params = self._extract_rust_params(params_node, src)

        # 返回类型
        ret_node = node.child_by_field_name("return_type")
        if ret_node:
            fn.returns = self._clean_rust_type(self.node_text(ret_node, src))
        else:
            fn.returns = "None"

        # 调用链
        body = node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_rust_calls(body, src)
            fn.raises = self._extract_rust_errors(body, src)

        return fn

    def _extract_rust_params(self, params_node, src: str) -> list[ParamIR]:
        params = []
        for child in params_node.children:
            if child.type == "parameter":
                pname = ""
                ptype = "Any"
                pattern = child.child_by_field_name("pattern")
                type_node = child.child_by_field_name("type")
                if pattern:
                    pname = self.node_text(pattern, src).strip().lstrip("&mut ").lstrip("&")
                if type_node:
                    ptype = self._clean_rust_type(self.node_text(type_node, src))
                if pname and pname != "self":
                    params.append(ParamIR(name=pname, type=ptype))
            elif child.type in ("self_parameter", "self"):
                pass  # skip self/&self/&mut self
        return params

    def _extract_rust_calls(self, body_node, src: str) -> list[str]:
        calls = []
        for node in self.find_all(body_node, "call_expression"):
            func_node = node.child_by_field_name("function")
            if func_node:
                call_text = self.node_text(func_node, src).strip()
                call_text = call_text.replace("self.", "self.")  # 保留
                if len(call_text) < 80 and call_text not in calls:
                    calls.append(call_text)
        # 也检查方法调用（Rust 用 . 语法）
        for node in self.find_all(body_node, "method_call_expression"):
            # receiver.method(args)
            method = node.child_by_field_name("name")
            if method:
                receiver_parts = []
                for child in node.children:
                    if child == method:
                        break
                    if child.type not in (".", ):
                        receiver_parts.append(self.node_text(child, src).strip())
                receiver = ".".join(receiver_parts) if receiver_parts else ""
                method_name = self.node_text(method, src)
                full = f"{receiver}.{method_name}" if receiver else method_name
                full = full.strip(".")
                if len(full) < 80 and full not in calls:
                    calls.append(full)
        return calls

    def _extract_rust_errors(self, body_node, src: str) -> list[str]:
        """提取 ? 操作符和 Err() 返回涉及的错误类型。"""
        errors = []
        # 查找 Err(SomeError) 返回
        for node in self.find_all(body_node, "call_expression"):
            func = node.child_by_field_name("function")
            if func and self.node_text(func, src).strip() == "Err":
                args = node.child_by_field_name("arguments")
                if args:
                    text = self.node_text(args, src).strip("()")
                    # 尝试提取类型名
                    name = text.split("::")[0].split("(")[0].strip()
                    if name and name not in errors and len(name) < 50:
                        errors.append(name)
        return errors

    # ─── 类型工具 ────────────────────────────────────────────

    def _get_rust_type(self, node, src: str) -> str:
        type_node = node.child_by_field_name("type")
        if type_node:
            return self._clean_rust_type(self.node_text(type_node, src))
        return "Any"

    @staticmethod
    def _clean_rust_type(text: str) -> str:
        text = text.strip().lstrip("-> ").strip()

        TYPE_MAP = {
            "String": "str",
            "&str": "str",
            "&String": "str",
            "i8": "int", "i16": "int", "i32": "int", "i64": "int", "i128": "int",
            "u8": "int", "u16": "int", "u32": "int", "u64": "int", "u128": "int",
            "isize": "int", "usize": "int",
            "f32": "float", "f64": "float",
            "bool": "bool",
            "()": "None",
            "char": "str",
        }

        # 去除引用
        clean = text.lstrip("&").removeprefix("mut ").strip()
        if clean in TYPE_MAP:
            return TYPE_MAP[clean]

        # Vec<T> → list[T]
        if clean.startswith("Vec<") and clean.endswith(">"):
            inner = clean[4:-1]
            return f"list[{RustParser._clean_rust_type(inner)}]"

        # HashMap<K, V> → dict[K, V]
        if clean.startswith("HashMap<") and clean.endswith(">"):
            inner = clean[8:-1]
            return f"dict[{inner}]"

        # Option<T> → Optional[T]
        if clean.startswith("Option<") and clean.endswith(">"):
            inner = clean[7:-1]
            return f"Optional[{RustParser._clean_rust_type(inner)}]"

        # Result<T, E> → Result[T, E]
        if clean.startswith("Result<") and clean.endswith(">"):
            inner = clean[7:-1]
            return f"Result[{inner}]"

        # Box<T>, Arc<T>, Rc<T> → T
        for wrapper in ("Box", "Arc", "Rc", "Mutex", "RwLock"):
            if clean.startswith(f"{wrapper}<") and clean.endswith(">"):
                inner = clean[len(wrapper)+1:-1]
                return RustParser._clean_rust_type(inner)

        return clean

    @staticmethod
    def _filter_deps(deps: list[str]) -> list[str]:
        """过滤掉基本类型，只保留有意义的依赖。"""
        SKIP = {"str", "int", "float", "bool", "None", "Any", "list", "dict", "Optional"}
        seen = set()
        result = []
        for d in deps:
            clean = d.split("[")[0].strip()  # list[Foo] → list
            if clean not in SKIP and clean not in seen:
                seen.add(clean)
                result.append(clean)
        return result
```

---

## 7. `parsers/cpp.py`

```python
"""
C / C++ 解析器：提取 class / struct / namespace / function。
"""

from __future__ import annotations
from pathlib import Path

try:
    import tree_sitter_cpp as tscpp
    from tree_sitter import Language, Parser as TSParser
    CPP_LANG = Language(tscpp.language())
    HAS_CPP = True
except ImportError:
    HAS_CPP = False

from .base import (
    ModuleIR, ClassIR, FunctionIR, ParamIR, EnumIR, TreeSitterBase
)


class CppParser(TreeSitterBase):

    def __init__(self):
        if not HAS_CPP:
            raise ImportError("tree-sitter-cpp not installed")
        self.parser = TSParser(CPP_LANG)

    def parse(self, file: Path) -> ModuleIR:
        source = file.read_bytes()
        tree = self.parser.parse(source)
        src = source.decode("utf-8")

        ir = ModuleIR(source_path=str(file), lang="cpp")

        self._extract_includes(tree.root_node, src, ir)
        self._extract_enums(tree.root_node, src, ir)
        self._extract_classes(tree.root_node, src, ir)
        self._extract_top_functions(tree.root_node, src, ir)

        return ir

    # ─── #include ────────────────────────────────────────────

    def _extract_includes(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "preproc_include"):
            text = self.node_text(node, src).strip()
            # #include <foo> or #include "bar.h"
            path = text.removeprefix("#include").strip().strip("<>\"")
            ir.imports.append(path)

    # ─── Enums ───────────────────────────────────────────────

    def _extract_enums(self, root, src: str, ir: ModuleIR):
        for node in self.find_all_types(root, {"enum_specifier"}):
            name = self.get_name(node, src)
            variants = []
            body = self.find_first(node, "enumerator_list")
            if body:
                for e in self.find_all(body, "enumerator"):
                    variants.append(self.get_name(e, src))
            ir.enums.append(EnumIR(
                name=name, variants=variants,
                source_lines=self.lines_of(node),
            ))

    # ─── class / struct ──────────────────────────────────────

    def _extract_classes(self, root, src: str, ir: ModuleIR):
        for node in self.find_all_types(root, {"class_specifier", "struct_specifier"}):
            name = self.get_name(node, src)
            if name == "<anonymous>":
                continue

            cls = ClassIR(name=name, source_lines=self.lines_of(node))

            # 基类
            base_list = self.find_first(node, "base_class_clause")
            if base_list:
                for base in self.find_all(base_list, "type_identifier"):
                    cls.bases.append(self.node_text(base, src))

            # 方法
            body = self.find_first(node, "field_declaration_list")
            if body:
                # 公有/保护/私有分区
                current_access = "public" if node.type == "struct_specifier" else "private"
                for child in body.children:
                    if child.type == "access_specifier":
                        current_access = self.node_text(child, src).strip().rstrip(":")

                    elif child.type == "function_definition":
                        fn = self._parse_cpp_function(child, src)
                        if fn:
                            fn.is_public = (current_access == "public")
                            cls.methods.append(fn)

                    elif child.type == "declaration":
                        # 可能是成员函数声明（无体）或字段
                        fn = self._try_parse_method_decl(child, src)
                        if fn:
                            fn.is_public = (current_access == "public")
                            cls.methods.append(fn)
                        else:
                            # 字段
                            fname = self.get_name(child, src)
                            ftype = self._get_cpp_type(child, src)
                            if fname != "<anonymous>":
                                cls.fields.append(ParamIR(name=fname, type=ftype))

                    elif child.type == "field_declaration":
                        fname = self.get_name(child, src)
                        ftype = self._get_cpp_type(child, src)
                        if fname != "<anonymous>":
                            cls.fields.append(ParamIR(name=fname, type=ftype))

            # 依赖：构造函数参数 + 字段类型
            for m in cls.methods:
                if m.is_constructor:
                    cls.depends_on.extend(p.type for p in m.params if p.type != "Any")
            for f in cls.fields:
                if f.type not in ("Any", "int", "float", "bool", "str", "void"):
                    if f.type not in cls.depends_on:
                        cls.depends_on.append(f.type)

            ir.classes.append(cls)

    # ─── 顶层函数 ────────────────────────────────────────────

    def _extract_top_functions(self, root, src: str, ir: ModuleIR):
        for node in root.children:
            if node.type == "function_definition":
                fn = self._parse_cpp_function(node, src)
                if fn:
                    ir.functions.append(fn)
            elif node.type == "namespace_definition":
                # 递归进 namespace
                body = node.child_by_field_name("body")
                ns_name = self.get_name(node, src)
                if body:
                    self._extract_namespace(body, src, ir, ns_name)

    def _extract_namespace(self, body_node, src: str, ir: ModuleIR, ns: str):
        for node in body_node.children:
            if node.type == "function_definition":
                fn = self._parse_cpp_function(node, src)
                if fn:
                    fn.name = f"{ns}::{fn.name}"
                    ir.functions.append(fn)
            elif node.type in ("class_specifier", "struct_specifier"):
                # 会在 _extract_classes 中处理，这里跳过
                pass

    # ─── 函数解析 ────────────────────────────────────────────

    def _parse_cpp_function(self, node, src: str) -> FunctionIR | None:
        declarator = node.child_by_field_name("declarator")
        if not declarator:
            return None

        name = self._get_function_name(declarator, src)
        if not name:
            return None

        fn = FunctionIR(
            name=name,
            is_constructor=(name == name.split("::")[-1] and "::" in name) or False,
            source_lines=self.lines_of(node),
            is_public=True,  # 顶层默认 public
        )

        # 检查是否是构造函数（类名与函数名相同）
        parts = name.split("::")
        if len(parts) >= 2 and parts[-1] == parts[-2]:
            fn.is_constructor = True

        # 虚函数 / override
        text_prefix = self.node_text(node, src)[:50]
        if "virtual" in text_prefix:
            fn.decorators.append("virtual")
        if "override" in self.node_text(node, src)[-20:]:
            fn.decorators.append("override")
        if "static" in text_prefix:
            fn.is_static = True

        # 返回类型
        type_node = node.child_by_field_name("type")
        if type_node:
            fn.returns = self._clean_cpp_type(self.node_text(type_node, src))
        else:
            fn.returns = "None"

        # 参数
        params = self.find_first(declarator, "parameter_list")
        if params:
            fn.params = self._extract_cpp_params(params, src)

        # 调用链
        body = node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_cpp_calls(body, src)
            fn.raises = self._extract_cpp_throws(body, src)

        return fn

    def _try_parse_method_decl(self, node, src: str) -> FunctionIR | None:
        """尝试从 declaration 节点中解析方法声明（无函数体）。"""
        declarator = self.find_first(node, "function_declarator")
        if not declarator:
            return None
        name = self._get_function_name(declarator, src)
        if not name:
            return None
        fn = FunctionIR(
            name=name,
            source_lines=self.lines_of(node),
        )
        params = self.find_first(declarator, "parameter_list")
        if params:
            fn.params = self._extract_cpp_params(params, src)
        type_node = node.child_by_field_name("type")
        if type_node:
            fn.returns = self._clean_cpp_type(self.node_text(type_node, src))
        return fn

    def _get_function_name(self, declarator, src: str) -> str:
        """从声明符中提取函数名，处理 Class::method 格式。"""
        # function_declarator → 内部可能有 qualified_identifier
        qi = self.find_first(declarator, "qualified_identifier")
        if qi:
            return self.node_text(qi, src).strip()
        fi = self.find_first(declarator, "field_identifier")
        if fi:
            return self.node_text(fi, src).strip()
        di = self.find_first(declarator, "destructor_name")
        if di:
            return "~" + self.get_name(di, src)
        name_node = declarator.child_by_field_name("declarator")
        if name_node:
            return self.node_text(name_node, src).strip()
        return self.get_name(declarator, src)

    def _extract_cpp_params(self, params_node, src: str) -> list[ParamIR]:
        params = []
        for child in params_node.children:
            if child.type in ("parameter_declaration", "optional_parameter_declaration"):
                ptype = self._get_cpp_type(child, src)
                declarator = child.child_by_field_name("declarator")
                pname = self.node_text(declarator, src).strip() if declarator else f"arg{len(params)}"
                # 去掉引用/指针符号
                pname = pname.lstrip("*&").strip()
                if pname:
                    params.append(ParamIR(name=pname, type=ptype))
        return params

    def _extract_cpp_calls(self, body_node, src: str) -> list[str]:
        calls = []
        for node in self.find_all(body_node, "call_expression"):
            func = node.child_by_field_name("function")
            if func:
                text = self.node_text(func, src).strip()
                # 替换 -> 和 :: 为 .
                text = text.replace("->", ".").replace("::", ".")
                if len(text) < 80 and text not in calls:
                    calls.append(text)
        return calls

    def _extract_cpp_throws(self, body_node, src: str) -> list[str]:
        throws = []
        for node in self.find_all(body_node, "throw_statement"):
            new_expr = self.find_first(node, "call_expression")
            if new_expr:
                func = new_expr.child_by_field_name("function")
                if func:
                    name = self.node_text(func, src).strip()
                    if name not in throws:
                        throws.append(name)
        return throws

    # ─── 类型工具 ────────────────────────────────────────────

    def _get_cpp_type(self, node, src: str) -> str:
        type_node = node.child_by_field_name("type")
        if type_node:
            return self._clean_cpp_type(self.node_text(type_node, src))
        # 备选：找第一个 type_identifier
        ti = self.find_first(node, "type_identifier")
        if ti:
            return self.node_text(ti, src)
        # 基本类型
        pt = self.find_first(node, "primitive_type")
        if pt:
            return self._clean_cpp_type(self.node_text(pt, src))
        return "Any"

    @staticmethod
    def _clean_cpp_type(text: str) -> str:
        text = text.strip()

        TYPE_MAP = {
            "int": "int", "long": "int", "short": "int",
            "long long": "int", "unsigned": "int", "size_t": "int",
            "int8_t": "int", "int16_t": "int", "int32_t": "int", "int64_t": "int",
            "uint8_t": "int", "uint16_t": "int", "uint32_t": "int", "uint64_t": "int",
            "float": "float", "double": "float",
            "bool": "bool",
            "void": "None",
            "char": "str", "wchar_t": "str",
            "std::string": "str", "string": "str",
        }

        # 去掉 const / volatile / mutable
        clean = text.replace("const ", "").replace("volatile ", "").replace("mutable ", "").strip()
        # 去掉引用和指针
        clean = clean.rstrip("&*").strip()

        if clean in TYPE_MAP:
            return TYPE_MAP[clean]

        # std::vector<T> → list[T]
        if "vector<" in clean:
            inner = clean[clean.index("<")+1:clean.rindex(">")]
            return f"list[{CppParser._clean_cpp_type(inner)}]"

        # std::map<K,V> / std::unordered_map<K,V>
        if "map<" in clean:
            inner = clean[clean.index("<")+1:clean.rindex(">")]
            return f"dict[{inner}]"

        # std::optional<T>
        if "optional<" in clean:
            inner = clean[clean.index("<")+1:clean.rindex(">")]
            return f"Optional[{CppParser._clean_cpp_type(inner)}]"

        # std::unique_ptr<T> / std::shared_ptr<T>
        for ptr in ("unique_ptr", "shared_ptr", "weak_ptr"):
            if f"{ptr}<" in clean:
                inner = clean[clean.index("<")+1:clean.rindex(">")]
                return CppParser._clean_cpp_type(inner)

        # 去掉 std:: 前缀
        clean = clean.removeprefix("std::")

        return clean
```

---

## 8. `parsers/go_lang.py`

```python
"""
Go 解析器：提取 struct / interface / func / method。
"""

from __future__ import annotations
from pathlib import Path

try:
    import tree_sitter_go as tsgo
    from tree_sitter import Language, Parser as TSParser
    GO_LANG = Language(tsgo.language())
    HAS_GO = True
except ImportError:
    HAS_GO = False

from .base import (
    ModuleIR, ClassIR, FunctionIR, ParamIR, TreeSitterBase
)


class GoParser(TreeSitterBase):

    def __init__(self):
        if not HAS_GO:
            raise ImportError("tree-sitter-go not installed")
        self.parser = TSParser(GO_LANG)

    def parse(self, file: Path) -> ModuleIR:
        source = file.read_bytes()
        tree = self.parser.parse(source)
        src = source.decode("utf-8")

        ir = ModuleIR(source_path=str(file), lang="go")

        self._extract_imports(tree.root_node, src, ir)
        self._extract_type_declarations(tree.root_node, src, ir)
        self._extract_functions(tree.root_node, src, ir)

        return ir

    # ─── imports ─────────────────────────────────────────────

    def _extract_imports(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "import_declaration"):
            for spec in self.find_all(node, "import_spec"):
                path_node = spec.child_by_field_name("path")
                if path_node:
                    ir.imports.append(
                        self.node_text(path_node, src).strip('"')
                    )
            # 单行 import
            path_node = node.child_by_field_name("path")
            if path_node:
                ir.imports.append(
                    self.node_text(path_node, src).strip('"')
                )

    # ─── type 声明（struct / interface）──────────────────────

    def _extract_type_declarations(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "type_declaration"):
            for spec in self.find_all(node, "type_spec"):
                name = self.get_name(spec, src)
                type_node = spec.child_by_field_name("type")
                if not type_node:
                    continue

                if type_node.type == "struct_type":
                    cls = ClassIR(name=name, source_lines=self.lines_of(node))
                    field_list = self.find_first(type_node, "field_declaration_list")
                    if field_list:
                        for field in self.find_all(field_list, "field_declaration"):
                            # 嵌入式类型（继承）
                            if not field.child_by_field_name("name"):
                                type_id = self.find_first(field, "type_identifier")
                                if type_id:
                                    cls.bases.append(self.node_text(type_id, src))
                                continue
                            fname_node = field.child_by_field_name("name")
                            ftype_node = field.child_by_field_name("type")
                            if fname_node:
                                fname = self.node_text(fname_node, src)
                                ftype = self._clean_go_type(
                                    self.node_text(ftype_node, src)
                                ) if ftype_node else "Any"
                                cls.fields.append(ParamIR(name=fname, type=ftype))
                                if ftype not in ("str", "int", "float", "bool", "Any"):
                                    if ftype not in cls.depends_on:
                                        cls.depends_on.append(ftype)
                    ir.classes.append(cls)

                elif type_node.type == "interface_type":
                    cls = ClassIR(
                        name=name,
                        is_abstract=True,
                        source_lines=self.lines_of(node),
                    )
                    method_specs = self.find_all(type_node, "method_spec")
                    for ms in method_specs:
                        fn = FunctionIR(
                            name=self.get_name(ms, src),
                            source_lines=self.lines_of(ms),
                            is_public=True,
                        )
                        params_node = ms.child_by_field_name("parameters")
                        if params_node:
                            fn.params = self._extract_go_params(params_node, src)
                        result_node = ms.child_by_field_name("result")
                        if result_node:
                            fn.returns = self._clean_go_type(self.node_text(result_node, src))
                        cls.methods.append(fn)
                    ir.classes.append(cls)

    # ─── 函数 / 方法 ────────────────────────────────────────

    def _extract_functions(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "function_declaration"):
            fn = self._parse_go_function(node, src)
            if fn:
                ir.functions.append(fn)

        for node in self.find_all(root, "method_declaration"):
            fn = self._parse_go_function(node, src)
            if fn:
                # 提取 receiver 类型，挂到对应 struct 上
                receiver = node.child_by_field_name("receiver")
                if receiver:
                    recv_type = self._extract_receiver_type(receiver, src)
                    target = None
                    for cls in ir.classes:
                        if cls.name == recv_type:
                            target = cls
                            break
                    if target:
                        target.methods.append(fn)
                    else:
                        # struct 定义在其他文件
                        cls = ClassIR(name=recv_type)
                        cls.methods.append(fn)
                        ir.classes.append(cls)
                else:
                    ir.functions.append(fn)

    def _parse_go_function(self, node, src: str) -> FunctionIR | None:
        name = self.get_name(node, src)
        if not name or name == "<anonymous>":
            return None

        fn = FunctionIR(
            name=name,
            is_public=name[0].isupper(),  # Go 导出约定
            source_lines=self.lines_of(node),
        )

        params_node = node.child_by_field_name("parameters")
        if params_node:
            fn.params = self._extract_go_params(params_node, src)

        result_node = node.child_by_field_name("result")
        if result_node:
            fn.returns = self._clean_go_type(self.node_text(result_node, src))
        else:
            fn.returns = "None"

        body = node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_go_calls(body, src)

        return fn

    def _extract_go_params(self, params_node, src: str) -> list[ParamIR]:
        params = []
        for child in params_node.children:
            if child.type == "parameter_declaration":
                names = []
                for n in child.children:
                    if n.type == "identifier":
                        names.append(self.node_text(n, src))
                type_node = child.child_by_field_name("type")
                ptype = self._clean_go_type(
                    self.node_text(type_node, src)
                ) if type_node else "Any"
                for pname in names:
                    params.append(ParamIR(name=pname, type=ptype))
        return params

    def _extract_go_calls(self, body_node, src: str) -> list[str]:
        calls = []
        for node in self.find_all(body_node, "call_expression"):
            func = node.child_by_field_name("function")
            if func:
                text = self.node_text(func, src).strip()
                if len(text) < 80 and text not in calls:
                    calls.append(text)
        return calls

    def _extract_receiver_type(self, receiver, src: str) -> str:
        """从 (r *Foo) 或 (r Foo) 中提取 Foo。"""
        for child in receiver.children:
            if child.type == "parameter_declaration":
                type_node = child.child_by_field_name("type")
                if type_node:
                    text = self.node_text(type_node, src).strip().lstrip("*")
                    return text
        return "<unknown>"

    @staticmethod
    def _clean_go_type(text: str) -> str:
        text = text.strip()
        TYPE_MAP = {
            "string": "str",
            "int": "int", "int8": "int", "int16": "int", "int32": "int", "int64": "int",
            "uint": "int", "uint8": "int", "uint16": "int", "uint32": "int", "uint64": "int",
            "float32": "float", "float64": "float",
            "bool": "bool",
            "byte": "int",
            "rune": "str",
            "error": "Exception",
        }
        clean = text.lstrip("*")
        if clean in TYPE_MAP:
            return TYPE_MAP[clean]

        # []T → list[T]
        if clean.startswith("[]"):
            inner = clean[2:]
            return f"list[{GoParser._clean_go_type(inner)}]"

        # map[K]V → dict[K, V]
        if clean.startswith("map["):
            bracket_end = clean.index("]")
            key = clean[4:bracket_end]
            val = clean[bracket_end+1:]
            return f"dict[{GoParser._clean_go_type(key)}, {GoParser._clean_go_type(val)}]"

        # 多返回值 (T, error) → tuple[T, Exception]
        if clean.startswith("(") and clean.endswith(")"):
            inner = clean[1:-1]
            parts = [GoParser._clean_go_type(p.strip()) for p in inner.split(",")]
            return f"tuple[{', '.join(parts)}]"

        return clean
```

---

## 9. `parsers/python_lang.py`

```python
"""
Python 解析器：提取 class / def / import。
（对 Python 项目也可以生成统一骨架以保持一致性。）
"""

from __future__ import annotations
from pathlib import Path

try:
    import tree_sitter_python as tspy
    from tree_sitter import Language, Parser as TSParser
    PY_LANG = Language(tspy.language())
    HAS_PY = True
except ImportError:
    HAS_PY = False

from .base import (
    ModuleIR, ClassIR, FunctionIR, ParamIR, TreeSitterBase
)


class PythonParser(TreeSitterBase):

    def __init__(self):
        if not HAS_PY:
            raise ImportError("tree-sitter-python not installed")
        self.parser = TSParser(PY_LANG)

    def parse(self, file: Path) -> ModuleIR:
        source = file.read_bytes()
        tree = self.parser.parse(source)
        src = source.decode("utf-8")

        ir = ModuleIR(source_path=str(file), lang="python")

        self._extract_imports(tree.root_node, src, ir)
        self._extract_classes(tree.root_node, src, ir)
        self._extract_top_functions(tree.root_node, src, ir)

        return ir

    def _extract_imports(self, root, src: str, ir: ModuleIR):
        for node in self.find_all_types(root, {"import_statement", "import_from_statement"}):
            text = self.node_text(node, src).strip()
            ir.imports.append(text)

    def _extract_classes(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "class_definition"):
            name = self.get_name(node, src)
            cls = ClassIR(name=name, source_lines=self.lines_of(node))

            # 基类
            superclasses = node.child_by_field_name("superclasses")
            if superclasses:
                for child in superclasses.children:
                    if child.type in ("identifier", "attribute"):
                        cls.bases.append(self.node_text(child, src))

            # 方法
            body = node.child_by_field_name("body")
            if body:
                for fn_node in self.find_all(body, "function_definition"):
                    fn = self._parse_py_function(fn_node, src)
                    if fn:
                        if fn.name == "__init__":
                            fn.is_constructor = True
                            cls.depends_on = [
                                p.type for p in fn.params
                                if p.type != "Any" and p.name != "self"
                            ]
                        cls.methods.append(fn)

            ir.classes.append(cls)

    def _extract_top_functions(self, root, src: str, ir: ModuleIR):
        for node in root.children:
            if node.type == "function_definition":
                fn = self._parse_py_function(node, src)
                if fn:
                    ir.functions.append(fn)

    def _parse_py_function(self, node, src: str) -> FunctionIR | None:
        name = self.get_name(node, src)
        fn = FunctionIR(
            name=name,
            is_async=any(c.type == "async" for c in node.children),
            is_public=not name.startswith("_") or name.startswith("__"),
            source_lines=self.lines_of(node),
        )

        # 装饰器
        for child in node.children:
            if child.type == "decorator":
                fn.decorators.append(
                    self.node_text(child, src).lstrip("@").strip()
                )
                if "staticmethod" in fn.decorators:
                    fn.is_static = True

        # 参数
        params = node.child_by_field_name("parameters")
        if params:
            fn.params = self._extract_py_params(params, src)

        # 返回类型
        ret = node.child_by_field_name("return_type")
        if ret:
            fn.returns = self.node_text(ret, src).strip().lstrip("-> ").strip()
        else:
            fn.returns = "Any"

        # 调用链
        body = node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_py_calls(body, src)
            fn.raises = self._extract_py_raises(body, src)

        return fn

    def _extract_py_params(self, params_node, src: str) -> list[ParamIR]:
        params = []
        for child in params_node.children:
            if child.type in ("identifier",):
                pname = self.node_text(child, src)
                if pname != "self" and pname != "cls":
                    params.append(ParamIR(name=pname))
            elif child.type in ("typed_parameter", "default_parameter", "typed_default_parameter"):
                pname = self.get_name(child, src)
                ptype = "Any"
                type_node = child.child_by_field_name("type")
                if type_node:
                    ptype = self.node_text(type_node, src).strip()
                if pname not in ("self", "cls"):
                    params.append(ParamIR(name=pname, type=ptype))
        return params

    def _extract_py_calls(self, body_node, src: str) -> list[str]:
        calls = []
        for node in self.find_all(body_node, "call"):
            func = node.child_by_field_name("function")
            if func:
                text = self.node_text(func, src).strip()
                if len(text) < 80 and text not in calls:
                    calls.append(text)
        return calls

    def _extract_py_raises(self, body_node, src: str) -> list[str]:
        raises = []
        for node in self.find_all(body_node, "raise_statement"):
            # raise FooError(...)
            for child in node.children:
                if child.type == "call":
                    func = child.child_by_field_name("function")
                    if func:
                        name = self.node_text(func, src).strip()
                        if name not in raises:
                            raises.append(name)
                elif child.type == "identifier":
                    name = self.node_text(child, src)
                    if name not in raises:
                        raises.append(name)
        return raises
```

---

## 10. `parsers/java.py`

```python
"""
Java 解析器：提取 class / interface / enum / method。
"""

from __future__ import annotations
from pathlib import Path

try:
    import tree_sitter_java as tsjava
    from tree_sitter import Language, Parser as TSParser
    JAVA_LANG = Language(tsjava.language())
    HAS_JAVA = True
except ImportError:
    HAS_JAVA = False

from .base import (
    ModuleIR, ClassIR, FunctionIR, ParamIR, EnumIR, TreeSitterBase
)


class JavaParser(TreeSitterBase):

    def __init__(self):
        if not HAS_JAVA:
            raise ImportError("tree-sitter-java not installed")
        self.parser = TSParser(JAVA_LANG)

    def parse(self, file: Path) -> ModuleIR:
        source = file.read_bytes()
        tree = self.parser.parse(source)
        src = source.decode("utf-8")

        ir = ModuleIR(source_path=str(file), lang="java")

        self._extract_imports(tree.root_node, src, ir)
        self._extract_classes(tree.root_node, src, ir)

        return ir

    def _extract_imports(self, root, src: str, ir: ModuleIR):
        for node in self.find_all(root, "import_declaration"):
            text = self.node_text(node, src).strip().rstrip(";").removeprefix("import ")
            ir.imports.append(text)

    def _extract_classes(self, root, src: str, ir: ModuleIR):
        for node in self.find_all_types(root, {
            "class_declaration", "interface_declaration", "enum_declaration"
        }):
            if node.type == "enum_declaration":
                name = self.get_name(node, src)
                body = self.find_first(node, "enum_body")
                variants = []
                if body:
                    for c in self.find_all(body, "enum_constant"):
                        variants.append(self.get_name(c, src))
                ir.enums.append(EnumIR(name=name, variants=variants,
                                       source_lines=self.lines_of(node)))
                continue

            name = self.get_name(node, src)
            cls = ClassIR(
                name=name,
                is_abstract=node.type == "interface_declaration" or
                            any(self.node_text(c, src) == "abstract" for c in node.children
                                if c.type == "modifiers" or c.type == "modifier"),
                source_lines=self.lines_of(node),
            )

            # extends / implements
            superclass = node.child_by_field_name("superclass")
            if superclass:
                cls.bases.append(self.node_text(superclass, src).strip().removeprefix("extends "))
            interfaces = node.child_by_field_name("interfaces")
            if interfaces:
                for ti in self.find_all(interfaces, "type_identifier"):
                    cls.bases.append(self.node_text(ti, src))

            # 方法
            body = node.child_by_field_name("body")
            if body:
                for method_node in self.find_all(body, "method_declaration"):
                    fn = self._parse_java_method(method_node, src)
                    if fn:
                        cls.methods.append(fn)
                for ctor_node in self.find_all(body, "constructor_declaration"):
                    fn = self._parse_java_method(ctor_node, src)
                    if fn:
                        fn.is_constructor = True
                        cls.depends_on = [p.type for p in fn.params if p.type != "Any"]
                        cls.methods.append(fn)

            ir.classes.append(cls)

    def _parse_java_method(self, node, src: str) -> FunctionIR | None:
        name = self.get_name(node, src)
        if not name or name == "<anonymous>":
            return None

        fn = FunctionIR(
            name=name,
            source_lines=self.lines_of(node),
        )

        # 修饰符
        modifiers = self.find_first(node, "modifiers")
        if modifiers:
            mod_text = self.node_text(modifiers, src)
            fn.is_public = "public" in mod_text
            fn.is_static = "static" in mod_text
            # 注解
            for ann in self.find_all(modifiers, "marker_annotation"):
                fn.decorators.append(self.node_text(ann, src).lstrip("@"))
            for ann in self.find_all(modifiers, "annotation"):
                fn.decorators.append(self.node_text(ann, src).lstrip("@"))

        # 返回类型
        type_node = node.child_by_field_name("type")
        if type_node:
            fn.returns = self._clean_java_type(self.node_text(type_node, src))
        else:
            fn.returns = "None"

        # 参数
        params_node = node.child_by_field_name("parameters")
        if params_node:
            for p in self.find_all(params_node, "formal_parameter"):
                ptype_node = p.child_by_field_name("type")
                pname_node = p.child_by_field_name("name")
                ptype = self._clean_java_type(self.node_text(ptype_node, src)) if ptype_node else "Any"
                pname = self.node_text(pname_node, src) if pname_node else f"arg"
                fn.params.append(ParamIR(name=pname, type=ptype))

        # 调用链
        body = node.child_by_field_name("body")
        if body:
            fn.calls = self._extract_java_calls(body, src)
            fn.raises = self._extract_java_throws(node, src)

        return fn

    def _extract_java_calls(self, body_node, src: str) -> list[str]:
        calls = []
        for node in self.find_all(body_node, "method_invocation"):
            obj = node.child_by_field_name("object")
            name_node = node.child_by_field_name("name")
            if name_node:
                name = self.node_text(name_node, src)
                if obj:
                    prefix = self.node_text(obj, src).strip()
                    full = f"{prefix}.{name}"
                else:
                    full = name
                if len(full) < 80 and full not in calls:
                    calls.append(full)
        return calls

    def _extract_java_throws(self, method_node, src: str) -> list[str]:
        """从 throws 子句提取。"""
        raises = []
        # throws 声明
        throws_node = self.find_first(method_node, "throws")
        if throws_node:
            for ti in self.find_all(throws_node, "type_identifier"):
                raises.append(self.node_text(ti, src))
        # throw 语句
        body = method_node.child_by_field_name("body")
        if body:
            for node in self.find_all(body, "throw_statement"):
                new_expr = self.find_first(node, "object_creation_expression")
                if new_expr:
                    type_node = new_expr.child_by_field_name("type")
                    if type_node:
                        name = self.node_text(type_node, src)
                        if name not in raises:
                            raises.append(name)
        return raises

    @staticmethod
    def _clean_java_type(text: str) -> str:
        text = text.strip()
        TYPE_MAP = {
            "int": "int", "long": "int", "short": "int", "byte": "int",
            "Integer": "int", "Long": "int",
            "float": "float", "double": "float",
            "Float": "float", "Double": "float",
            "boolean": "bool", "Boolean": "bool",
            "String": "str",
            "void": "None",
            "char": "str", "Character": "str",
        }
        if text in TYPE_MAP:
            return TYPE_MAP[text]
        # List<T> → list[T]
        if text.startswith("List<") and text.endswith(">"):
            return f"list[{JavaParser._clean_java_type(text[5:-1])}]"
        if text.startswith("ArrayList<") and text.endswith(">"):
            return f"list[{JavaParser._clean_java_type(text[10:-1])}]"
        # Map<K,V> → dict[K,V]
        if text.startswith("Map<") and text.endswith(">"):
            return f"dict[{text[4:-1]}]"
        if text.startswith("HashMap<") and text.endswith(">"):
            return f"dict[{text[8:-1]}]"
        # Optional<T>
        if text.startswith("Optional<") and text.endswith(">"):
            return f"Optional[{JavaParser._clean_java_type(text[9:-1])}]"
        # 泛型
        if "<" in text:
            base = text[:text.index("<")]
            inner = text[text.index("<")+1:text.rindex(">")]
            return f"{base}[{inner}]"
        # 数组
        if text.endswith("[]"):
            return f"list[{JavaParser._clean_java_type(text[:-2])}]"
        return text
```

---

## 11. `parsers/generic.py`（正则 fallback）

```python
"""
通用 fallback 解析器：
对没有专用 tree-sitter 解析器的语言，使用正则 + 启发式提取基本结构。
覆盖 C#、Ruby、Swift、Kotlin 以及任何未知语言。
"""

from __future__ import annotations
import re
from pathlib import Path
from .base import ModuleIR, ClassIR, FunctionIR, ParamIR, EnumIR


# ─── 通用正则模式 ────────────────────────────────────────────

# class Foo : Bar, Baz   /   class Foo(Bar)   /   class Foo extends Bar
RE_CLASS = re.compile(
    r'(?:(?:public|private|internal|open|abstract|sealed|data|final)\s+)*'
    r'(?:class|struct|interface|trait|object|protocol)\s+'
    r'(\w+)'
    r'(?:\s*(?:[:<(]|extends|implements)\s*(.+?))?'
    r'\s*[{:]?\s*$',
    re.MULTILINE
)

# func / fn / def / fun / function / method ...
RE_FUNC = re.compile(
    r'(?:(?:public|private|protected|internal|open|override|static|async|suspend|virtual|abstract)\s+)*'
    r'(?:func|fn|def|fun|function|sub|method)\s+'
    r'(\w+)'
    r'\s*(?:<[^>]*>)?\s*'  # 泛型
    r'\(([^)]*)\)'
    r'(?:\s*(?:->|:)\s*(.+?))?'
    r'\s*[{:]?\s*$',
    re.MULTILINE
)

# import / use / require / include / using
RE_IMPORT = re.compile(
    r'^\s*(?:import|use|require|include|using|from\s+\S+\s+import)\s+(.+?)$',
    re.MULTILINE
)

# enum Foo { ... }
RE_ENUM = re.compile(
    r'(?:(?:public|private)\s+)?enum\s+(?:class\s+)?(\w+)',
    re.MULTILINE
)

# 函数体内的调用：foo.bar( 或 foo(
RE_CALL = re.compile(r'(\w+(?:\.\w+)*)\s*\(')

# throw / raise / panic
RE_THROW = re.compile(r'(?:throw|raise|panic!?)\s+(?:new\s+)?(\w+)')


class GenericParser:
    """
    正则驱动的通用解析器。
    精度较低，但能处理任何文本语言文件。
    """

    def __init__(self, lang: str = "unknown"):
        self.lang = lang

    def parse(self, file: Path) -> ModuleIR:
        src = file.read_text(encoding="utf-8", errors="replace")
        ir = ModuleIR(source_path=str(file), lang=self.lang)

        # imports
        for m in RE_IMPORT.finditer(src):
            ir.imports.append(m.group(1).strip().rstrip(";"))

        # enums
        for m in RE_ENUM.finditer(src):
            ir.enums.append(EnumIR(
                name=m.group(1),
                source_lines=(src[:m.start()].count("\n") + 1,
                              src[:m.end()].count("\n") + 1),
            ))

        # 按行扫描，构建类和函数结构
        lines = src.split("\n")
        current_class: ClassIR | None = None
        indent_stack: list[int] = []

        i = 0
        while i < len(lines):
            line = lines[i]
            stripped = line.rstrip()

            # 空行/注释跳过
            if not stripped or stripped.lstrip().startswith("//") or stripped.lstrip().startswith("#"):
                i += 1
                continue

            indent = len(line) - len(line.lstrip())

            # 检查是否退出当前类
            if current_class and indent_stack and indent <= indent_stack[-1]:
                ir.classes.append(current_class)
                current_class = None
                indent_stack.pop()

            # 类匹配
            cls_match = RE_CLASS.search(stripped)
            if cls_match:
                name = cls_match.group(1)
                bases_raw = cls_match.group(2) or ""
                bases = [b.strip() for b in bases_raw.split(",") if b.strip()]
                # 清理：去掉泛型等
                bases = [b.split("<")[0].split("(")[0].strip() for b in bases]

                current_class = ClassIR(
                    name=name,
                    bases=[b for b in bases if b and b[0].isupper()],
                    source_lines=(i + 1, i + 1),
                )
                indent_stack.append(indent)
                i += 1
                continue

            # 函数匹配
            fn_match = RE_FUNC.search(stripped)
            if fn_match:
                fn = self._parse_generic_function(
                    fn_match, lines, i, indent
                )
                if fn:
                    if current_class:
                        if fn.name in ("__init__", "init", "constructor", "initialize", current_class.name):
                            fn.is_constructor = True
                            current_class.depends_on = [
                                p.type for p in fn.params
                                if p.type != "Any" and p.name not in ("self", "this")
                            ]
                        current_class.methods.append(fn)
                    else:
                        ir.functions.append(fn)

            i += 1

        # 扫描结束，收尾
        if current_class:
            ir.classes.append(current_class)

        return ir

    def _parse_generic_function(
        self, match, lines: list[str], line_idx: int, base_indent: int
    ) -> FunctionIR | None:
        name = match.group(1)
        params_raw = match.group(2) or ""
        returns_raw = match.group(3) or "Any"

        fn = FunctionIR(
            name=name,
            returns=returns_raw.strip().rstrip("{").rstrip(":").strip() or "Any",
            is_async="async" in match.group(0) or "suspend" in match.group(0),
            is_public=not name.startswith("_"),
        )

        # 参数
        if params_raw.strip():
            for p in params_raw.split(","):
                p = p.strip()
                if not p or p in ("self", "this", "&self", "&mut self", "cls"):
                    continue
                parts = re.split(r'[:\s]+', p, maxsplit=1)
                pname = parts[0].strip().lstrip("&").lstrip("*").strip()
                ptype = parts[1].strip() if len(parts) > 1 else "Any"
                # 去掉默认值
                pname = pname.split("=")[0].strip()
                ptype = ptype.split("=")[0].strip()
                if pname:
                    fn.params.append(ParamIR(name=pname, type=ptype))

        # 扫描函数体提取调用（启发式：从下一行到缩进回到同级或以上）
        body_start = line_idx + 1
        body_end = body_start
        for j in range(body_start, min(len(lines), body_start + 200)):
            l = lines[j]
            if not l.strip():
                continue
            cur_indent = len(l) - len(l.lstrip())
            if cur_indent <= base_indent and l.strip() and j > body_start:
                break
            body_end = j

        fn.source_lines = (line_idx + 1, body_end + 1)

        # 提取调用
        body_text = "\n".join(lines[body_start:body_end + 1])
        calls = []
        for cm in RE_CALL.finditer(body_text):
            call = cm.group(1)
            # 过滤关键字
            if call in ("if", "for", "while", "switch", "catch", "return",
                        "new", "throw", "raise", "print", "println", "fmt"):
                continue
            if call not in calls and len(call) < 80:
                calls.append(call)
        fn.calls = calls

        # 提取异常
        raises = []
        for tm in RE_THROW.finditer(body_text):
            name = tm.group(1)
            if name not in raises:
                raises.append(name)
        fn.raises = raises

        return fn
```

---

## 12. `parsers/csharp.py`, `parsers/ruby.py`, `parsers/swift.py`, `parsers/kotlin.py`

这些语言使用 `GenericParser` 包装，当专用 tree-sitter 包可用时升级：

```python
# parsers/csharp.py
"""C# 解析器 —— 当前使用 GenericParser，未来可升级为 tree-sitter-c-sharp。"""
from .generic import GenericParser

class CSharpParser(GenericParser):
    def __init__(self):
        super().__init__(lang="csharp")
```

```python
# parsers/ruby.py
from .generic import GenericParser

class RubyParser(GenericParser):
    def __init__(self):
        super().__init__(lang="ruby")
```

```python
# parsers/swift.py
from .generic import GenericParser

class SwiftParser(GenericParser):
    def __init__(self):
        super().__init__(lang="swift")
```

```python
# parsers/kotlin.py
from .generic import GenericParser

class KotlinParser(GenericParser):
    def __init__(self):
        super().__init__(lang="kotlin")
```

---

## 13. `emitter.py`（完整版，补全 `_shorten_imports` 和 `_index.py` 生成）

```python
"""
IR → Python 骨架文件 + 交叉引用索引生成。
"""

from __future__ import annotations
from pathlib import Path
from .parsers.base import ModuleIR, FunctionIR, ClassIR, EnumIR


def emit_skeleton(ir: ModuleIR, src_file: Path, lang: str) -> str:
    """将单个模块的 IR 转换为 Python 骨架字符串。"""
    lines = [
        f"# source: {src_file} [lang: {lang}]",
        f"# {'─' * 60}",
        "",
    ]

    # 导入摘要
    if ir.imports:
        shortened = _shorten_imports(ir.imports)
        lines.append(f"# imports: {', '.join(shortened)}")
        lines.append("")

    # 常量
    if ir.constants:
        for const in ir.constants:
            lines.append(f"{const} = ...  # constant")
        lines.append("")

    # 枚举
    for enum in ir.enums:
        _emit_enum(enum, lines)
        lines.append("")

    # 类
    for cls in ir.classes:
        _emit_class(cls, lines)
        lines.append("")

    # 顶层函数
    for fn in ir.functions:
        _emit_function(fn, lines, indent="")
        lines.append("")

    # 尾部
    if not ir.classes and not ir.functions and not ir.enums:
        lines.append("# (no extractable definitions)")
        lines.append("")

    return "\n".join(lines)


def _emit_class(cls: ClassIR, lines: list[str]):
    """生成类的骨架代码。"""
    # class 声明
    if cls.bases:
        bases_str = ", ".join(cls.bases)
        lines.append(f"class {cls.name}({bases_str}):")
    else:
        lines.append(f"class {cls.name}:")

    has_content = False

    # 依赖注释
    if cls.depends_on:
        lines.append(f"    # depends_on: {', '.join(cls.depends_on)}")
        has_content = True

    # 抽象标记
    if cls.is_abstract:
        lines.append(f"    # abstract: True")
        has_content = True

    # 源码位置
    if cls.source_lines != (0, 0):
        lines.append(f"    # source_line: {cls.source_lines[0]}-{cls.source_lines[1]}")
        has_content = True

    if has_content:
        lines.append("")

    # 字段
    if cls.fields:
        for field in cls.fields:
            if field.type != "Any":
                lines.append(f"    {field.name}: {field.type}")
            else:
                lines.append(f"    {field.name}: Any")
        lines.append("")

    # 方法
    if cls.methods:
        for fn in cls.methods:
            _emit_function(fn, lines, indent="    ")
            lines.append("")
    elif not has_content and not cls.fields:
        lines.append("    ...")


def _emit_function(fn: FunctionIR, lines: list[str], indent: str):
    """生成函数/方法的骨架代码。"""
    # 装饰器
    if fn.decorators:
        for d in fn.decorators:
            lines.append(f"{indent}@{d}")

    # 可见性注释
    if not fn.is_public:
        lines.append(f"{indent}# visibility: private")

    # 函数签名
    async_prefix = "async " if fn.is_async else ""
    static_prefix = ""
    if fn.is_static:
        lines.append(f"{indent}@staticmethod")

    params_parts = []
    for p in fn.params:
        if p.type != "Any":
            params_parts.append(f"{p.name}: {p.type}")
        else:
            params_parts.append(p.name)
    params_str = ", ".join(params_parts)

    lines.append(f"{indent}{async_prefix}def {fn.name}({params_str}) -> {fn.returns}:")

    # 文档字符串（如果有）
    if fn.docstring:
        lines.append(f'{indent}    """{fn.docstring}"""')

    # 调用链注释
    if fn.calls:
        # 分行显示，如果太长
        if len(", ".join(fn.calls)) > 70:
            lines.append(f"{indent}    # calls:")
            for call in fn.calls:
                lines.append(f"{indent}    #   - {call}")
        else:
            lines.append(f"{indent}    # calls: {', '.join(fn.calls)}")

    # 异常注释
    if fn.raises:
        lines.append(f"{indent}    # raises: {', '.join(fn.raises)}")

    # 源码位置
    if fn.source_lines != (0, 0):
        lines.append(f"{indent}    # source_line: {fn.source_lines[0]}-{fn.source_lines[1]}")

    lines.append(f"{indent}    ...")


def _emit_enum(enum: EnumIR, lines: list[str]):
    """生成枚举的骨架代码。"""
    lines.append(f"class {enum.name}:  # enum")
    if enum.source_lines != (0, 0):
        lines.append(f"    # source_line: {enum.source_lines[0]}-{enum.source_lines[1]}")
    if enum.variants:
        for v in enum.variants:
            lines.append(f"    {v} = ...")
    else:
        lines.append("    ...")


def _shorten_imports(imports: list[str]) -> list[str]:
    """
    缩短导入路径：
    - 'import { Foo, Bar } from "@/services/foo"' → '@/services/foo'
    - 'std::collections::HashMap' → 'std.collections.HashMap'
    - 'from typing import Optional' → 'typing.Optional'
    - 完整路径 > 40 字符时截断
    """
    result = []
    for imp in imports:
        short = imp.strip()

        # 已经是短路径
        if len(short) <= 40:
            result.append(short)
            continue

        # 尝试只保留最后两段
        parts = short.replace("::", "/").replace(".", "/").split("/")
        if len(parts) > 2:
            short = "/".join(parts[-2:])
        elif len(parts) > 1:
            short = parts[-1]

        result.append(short)

    # 去重
    seen = set()
    deduped = []
    for r in result:
        if r not in seen:
            seen.add(r)
            deduped.append(r)

    return deduped


# ─── 交叉引用索引 ────────────────────────────────────────────

def generate_index(all_irs: list[tuple[Path, ModuleIR]], output_dir: Path):
    """
    从所有模块 IR 中生成 _index.py 交叉引用文件。
    """
    call_graph: dict[str, list[str]] = {}
    reverse_deps: dict[str, list[str]] = {}
    file_map: dict[str, str] = {}

    for src_file, ir in all_irs:
        for cls in ir.classes:
            file_map[cls.name] = str(src_file)
            for fn in cls.methods:
                qualified = f"{cls.name}.{fn.name}"
                call_graph[qualified] = fn.calls

                for call in fn.calls:
                    reverse_deps.setdefault(call, [])
                    if qualified not in reverse_deps[call]:
                        reverse_deps[call].append(qualified)

        for fn in ir.functions:
            call_graph[fn.name] = fn.calls
            for call in fn.calls:
                reverse_deps.setdefault(call, [])
                if fn.name not in reverse_deps[call]:
                    reverse_deps[call].append(fn.name)

    # 生成文件
    lines = [
        "# Auto-generated cross-reference index",
        "# Regenerate: python scripts/build_skeleton.py <project_root>",
        "",
        "CALL_GRAPH = {",
    ]
    for caller, callees in sorted(call_graph.items()):
        if callees:
            lines.append(f'    "{caller}": {callees},')
    lines.append("}")
    lines.append("")
    lines.append("REVERSE_DEPS = {")
    for callee, callers in sorted(reverse_deps.items()):
        if callers:
            lines.append(f'    "{callee}": {callers},')
    lines.append("}")
    lines.append("")
    lines.append("FILE_MAP = {")
    for name, path in sorted(file_map.items()):
        lines.append(f'    "{name}": "{path}",')
    lines.append("}")
    lines.append("")

    index_path = output_dir / "_index.py"
    index_path.write_text("\n".join(lines))
    print(f"  Index → {index_path}")
```

---

## 14. `build_skeleton.py`（完整版，支持 `--file` 增量 + 索引生成）

```python
#!/usr/bin/env python3
"""
Polyglot Skeleton Builder
将任意语言代码库转换为统一的 Python 骨架工程。

用法:
    python build_skeleton.py <project_root>
    python build_skeleton.py <project_root> --file src/services/order_service.rs
    python build_skeleton.py <project_root> --output .cursor/skeleton
"""

import sys
import time
import argparse
from pathlib import Path

# 让脚本能找到 parsers 包
sys.path.insert(0, str(Path(__file__).parent))

from parsers import get_parser
from emitter import emit_skeleton, generate_index
from parsers.base import ModuleIR

# ─── 配置 ────────────────────────────────────────────────────

LANG_MAP = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".mjs": "javascript", ".cjs": "javascript",
    ".rs": "rust",
    ".c": "c",
    ".cpp": "cpp", ".cc": "cpp", ".cxx": "cpp",
    ".h": "cpp", ".hpp": "cpp", ".hxx": "cpp",
    ".go": "go",
    ".py": "python",
    ".java": "java",
    ".cs": "csharp",
    ".rb": "ruby",
    ".swift": "swift",
    ".kt": "kotlin", ".kts": "kotlin",
}

IGNORE_DIRS = {
    "__pycache__", ".venv", "venv", "env",
    "node_modules", ".next",
    "target", "build", "dist", "out", "bin", "obj",
    ".git", ".svn", ".hg",
    "vendor", "third_party", "external",
    ".cursor",  # 不要递归骨架输出目录
    ".idea", ".vscode",
    "test", "tests", "__tests__", "spec",  # 可选：跳过测试
}

IGNORE_FILES = {
    "package-lock.json", "yarn.lock", "Cargo.lock",
    "go.sum", ".DS_Store", "Thumbs.db",
}

MAX_FILE_SIZE = 1024 * 1024  # 1MB，跳过超大文件


# ─── 主流程 ──────────────────────────────────────────────────

def build(root: Path, output: Path, single_file: Path | None = None):
    """构建骨架工程。"""
    output.mkdir(parents=True, exist_ok=True)

    start = time.time()
    stats = {"processed": 0, "skipped": 0, "errors": 0, "languages": set()}
    all_irs: list[tuple[Path, ModuleIR]] = []

    if single_file:
        files = [single_file]
    else:
        files = sorted(root.rglob("*"))

    for src_file in files:
        if not src_file.is_file():
            continue
        if src_file.name in IGNORE_FILES:
            continue
        if any(p in src_file.parts for p in IGNORE_DIRS):
            continue
        if src_file.stat().st_size > MAX_FILE_SIZE:
            stats["skipped"] += 1
            continue

        lang = LANG_MAP.get(src_file.suffix)
        if not lang:
            continue

        # 镜像目录结构
        rel = src_file.relative_to(root)
        skeleton_path = output / rel.with_suffix(".py")
        skeleton_path.parent.mkdir(parents=True, exist_ok=True)

        parser = get_parser(lang)
        try:
            ir = parser.parse(src_file)
            skeleton = emit_skeleton(ir, rel, lang)
            skeleton_path.write_text(skeleton, encoding="utf-8")
            all_irs.append((rel, ir))
            stats["processed"] += 1
            stats["languages"].add(lang)
        except Exception as e:
            print(f"  [error] {rel}: {e}")
            stats["errors"] += 1

    # 生成索引
    if not single_file and all_irs:
        generate_index(all_irs, output)

    # 生成 __init__.py 使 skeleton 可作为 package 导入（可选）
    init_file = output / "__init__.py"
    if not init_file.exists():
        init_file.write_text(
            "# Auto-generated skeleton package\n"
            "# See _index.py for cross-reference data\n"
        )

    elapsed = time.time() - start
    print(f"\n{'═' * 60}")
    print(f"  Skeleton built → {output}")
    print(f"  Files processed: {stats['processed']}")
    print(f"  Files skipped:   {stats['skipped']}")
    print(f"  Errors:          {stats['errors']}")
    print(f"  Languages:       {', '.join(sorted(stats['languages']))}")
    print(f"  Time:            {elapsed:.2f}s")
    print(f"{'═' * 60}")


# ─── CLI ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Build a polyglot skeleton from any codebase"
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Project root directory (default: current dir)"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output directory (default: <root>/.cursor/skeleton)"
    )
    parser.add_argument(
        "--file", "-f",
        default=None,
        help="Process a single file (incremental update)"
    )
    parser.add_argument(
        "--include-tests",
        action="store_true",
        help="Include test directories"
    )

    args = parser.parse_args()

    root = Path(args.root).resolve()
    output = Path(args.output) if args.output else root / ".cursor" / "skeleton"
    single = Path(args.file).resolve() if args.file else None

    if args.include_tests:
        IGNORE_DIRS.discard("test")
        IGNORE_DIRS.discard("tests")
        IGNORE_DIRS.discard("__tests__")
        IGNORE_DIRS.discard("spec")

    print(f"Building skeleton for: {root}")
    print(f"Output: {output}")
    if single:
        print(f"Single file mode: {single}")
    print()

    build(root, output, single)


if __name__ == "__main__":
    main()
```

---

## 15. `requirements.txt`

```
tree-sitter>=0.22.0
tree-sitter-typescript>=0.21.0
tree-sitter-javascript>=0.21.0
tree-sitter-rust>=0.21.0
tree-sitter-cpp>=0.21.0
tree-sitter-go>=0.21.0
tree-sitter-python>=0.21.0
tree-sitter-java>=0.21.0
# 以下是可选的，没有安装会自动 fallback 到 generic
# tree-sitter-c-sharp
# tree-sitter-ruby
# tree-sitter-swift
# tree-sitter-kotlin
```

---

## 最终目录结构

```
.cursor/skills/polyglot-skeleton/
├── SKILL.md
├── requirements.txt
└── scripts/
    ├── build_skeleton.py          # 主入口 CLI
    ├── emitter.py                 # IR → Python 骨架 + 索引
    └── parsers/
        ├── __init__.py            # 解析器注册表 + get_parser()
        ├── base.py                # IR 数据结构 + TreeSitterBase
        ├── typescript.py          # TS/TSX 解析器 ★★★★★
        ├── javascript.py          # JS/JSX（继承 TS）★★★★★
        ├── rust.py                # Rust 解析器 ★★★★★
        ├── cpp.py                 # C/C++ 解析器 ★★★★☆
        ├── go_lang.py             # Go 解析器 ★★★★☆
        ├── python_lang.py         # Python 解析器 ★★★★★
        ├── java.py                # Java 解析器 ★★★★☆
        ├── csharp.py              # C# (generic fallback)
        ├── ruby.py                # Ruby (generic fallback)
        ├── swift.py               # Swift (generic fallback)
        ├── kotlin.py              # Kotlin (generic fallback)
        └── generic.py             # 正则 fallback（任何语言）
```

运行后生成：

```
.cursor/skeleton/
├── __init__.py
├── _index.py                     # 交叉引用索引
├── frontend/
│   └── src/
│       ├── pages/checkout.py
│       └── services/payment.py
├── backend/
│   └── src/
│       ├── order_service.py
│       └── payment_service.py
└── core/
    └── engine.py
```

---

## 使用流程总结

```bash
# 1. 安装依赖
pip install -r .cursor/skills/polyglot-skeleton/requirements.txt

# 2. 首次全量构建
python .cursor/skills/polyglot-skeleton/scripts/build_skeleton.py .

# 3. 修改某个文件后增量更新
python .cursor/skills/polyglot-skeleton/scripts/build_skeleton.py . \
    --file src/services/order_service.rs

# 4. 在 Cursor 中使用
#    @.cursor/skeleton/  加入上下文
#    大模型即可看到完整的跨语言调用图谱
```