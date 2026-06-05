export default function transformer(file, api, options = {}) {
  const j = api.jscodeshift
  const root = j(file.source)

  const report = {
    file: file.path,
    transformed: 0,
    skipped: 0,
    selectConverted: 0,
  }

  const MODERN_IMPORT = "@/components/ModernInput"

  function hasImport() {
    return (
      root.find(j.ImportDeclaration, {
        source: { value: MODERN_IMPORT },
      }).size() > 0
    )
  }

  function isAlreadyModernInput(path) {
    return (
      path.node.openingElement.name.name === "ModernInput"
    )
  }

  function addImportIfNeeded() {
    if (hasImport()) return

    const importDecl = j.importDeclaration(
      [j.importDefaultSpecifier(j.identifier("ModernInput"))],
      j.literal(MODERN_IMPORT)
    )

    root.get().node.program.body.unshift(importDecl)
  }

  function addMarker(attrs) {
    const marker = j.jsxAttribute(
      j.jsxIdentifier("data-modern-input"),
      j.stringLiteral("migrated")
    )
    return [...attrs, marker]
  }

  function transformInput(path) {
    const el = path.node.openingElement

    if (isAlreadyModernInput(path)) {
      report.skipped++
      return
    }

    el.name = j.jsxIdentifier("ModernInput")

    el.attributes = addMarker(el.attributes)

    report.transformed++
  }

  function transformTextarea(path) {
    const el = path.node.openingElement

    if (isAlreadyModernInput(path)) {
      report.skipped++
      return
    }

    el.name = j.jsxIdentifier("ModernInput")

    el.attributes = [
      j.jsxAttribute(j.jsxIdentifier("as"), j.stringLiteral("textarea")),
      ...addMarker(el.attributes),
    ]

    report.transformed++
  }

  function extractOptionsFromSelect(path) {
    const options = []
    let hasComplexChildren = false

    j(path)
      .find(j.JSXElement, {
        openingElement: { name: { name: "option" } },
      })
      .forEach(opt => {
        const attrs = opt.node.openingElement.attributes

        let value = null
        let label = null

        attrs.forEach(attr => {
          if (attr.name?.name === "value") {
            value = attr.value?.value || ""
          }
        })

        const children = opt.node.children
          .filter(c => c.type === "JSXText")
          .map(c => c.value)
          .join("")
          .trim()

        label = children || value

        if (value !== null) {
          options.push({ value, label })
        } else {
          hasComplexChildren = true
        }
      })

    return { options, hasComplexChildren }
  }

  function removeOptionChildren(path) {
    path.node.children = path.node.children.filter(
      c => !(c.type === "JSXElement" && c.openingElement.name.name === "option")
    )
  }

  function transformSelect(path) {
    const el = path.node.openingElement

    if (isAlreadyModernInput(path)) {
      report.skipped++
      return
    }

    const { options, hasComplexChildren } = extractOptionsFromSelect(path)

    el.name = j.jsxIdentifier("ModernInput")

    let attrs = [
      j.jsxAttribute(j.jsxIdentifier("as"), j.stringLiteral("select")),
      ...el.attributes,
    ]

    // attach options ONLY if safe
    if (!hasComplexChildren && options.length > 0) {
      const optionsProp = j.jsxAttribute(
        j.jsxIdentifier("options"),
        j.jsxExpressionContainer(
          j.arrayExpression(
            options.map(o =>
              j.objectExpression([
                j.objectProperty(
                  j.identifier("value"),
                  j.stringLiteral(o.value)
                ),
                j.objectProperty(
                  j.identifier("label"),
                  j.stringLiteral(o.label)
                ),
              ])
            )
          )
        )
      )

      attrs.push(optionsProp)

      // remove inline options
      removeOptionChildren(path)

      report.selectConverted++
    }

    el.attributes = addMarker(attrs)

    report.transformed++
  }

  // RUN TRANSFORMS
  root.findJSXElements("input").forEach(transformInput)
  root.findJSXElements("textarea").forEach(transformTextarea)
  root.findJSXElements("select").forEach(transformSelect)

  addImportIfNeeded()

  // attach report to file metadata (jscodeshift prints it if you log)
  if (options.report !== false) {
    console.log("\n[ModernInput Codemod Report]")
    console.log(JSON.stringify(report, null, 2))
  }

  return root.toSource({ quote: "double" })
}