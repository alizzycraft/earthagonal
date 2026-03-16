import re
import os

filepath = 'docs/optimization.md'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Overview through 5 Base Icosahedron are mostly fine.

# Replace HexRelaxationService signature
text = text.replace(
    'relax(cells: Cell[], iterations: number): void',
    'relax(cells: Cell[]): void'
)

# 2. Fix error handling + geodesics Section Numbering
text = text.replace('# 6. Error Handling', '# 6.1 Error Handling\n(Moved to Geodesic Setup)')
# Oh wait, let's do section renaming more robustly.

# 6 -> 6.1
text = re.sub(r'# 7\. Direct Geodesic Grid Generation \(Optimized\)', '# 6. Geodesic Grid Generation', text)
text = re.sub(r'# 5\.1 Subdivision Parameter', '# 6.2 Subdivision Parameter', text)
text = re.sub(r'# 5\.2 Barycentric Grid Coordinates', '# 6.3 Barycentric Grid Coordinates', text)
text = re.sub(r'# 5\.3 Position Calculation', '# 6.4 Position Calculation', text)
text = re.sub(r'# 5\.4 Deterministic Vertex Indexing', '# 6.5 Deterministic Vertex Indexing', text)
text = re.sub(r'# 5\.5 Triangle Generation', '# 6.6 Triangle Generation', text)
text = re.sub(r'# 5\.6 Array Preallocation', '# 6.7 Array Preallocation', text)
text = re.sub(r'# 5\.7 Edge Continuity', '# 6.8 Edge Continuity', text)
text = re.sub(r'# 5\.8 Memory and Performance', '# 6.9 Memory and Performance', text)
text = re.sub(r'# 5\.9 Output of Task 5', '# 6.10 Output of Geodesic Grid Generation', text)
text = re.sub(r'# 5\.10 Why This Optimization Matters', '# 6.11 Why This Optimization Matters', text)

# 7. Dual Mesh Construction
text = re.sub(r'# 6\. Dual Mesh Construction \(Optimized\)', '# 7. Dual Mesh Construction', text)
text = re.sub(r'# 6\.1 Triangle Centers', '# 7.1 Triangle Centers', text)
text = re.sub(r'# 6\.2 Vertex → Triangle Adjacency', '# 7.2 Vertex -> Triangle Adjacency', text)
text = re.sub(r'# 6\.3 Precompute Directed Edge Map', '# 7.3 Precompute Directed Edge Map', text)
text = re.sub(r'# 6\.4 Ordered Triangle Walk Around Vertex', '# 7.4 Ordered Triangle Walk Around Vertex', text)
text = re.sub(r'# 6\.5 Construct Polygon Vertices', '# 7.5 Construct Polygon Vertices', text)
text = re.sub(r'# 6\.6 Neighbor Cell Detection', '# 7.6 Neighbor Cell Detection', text)
text = re.sub(r'# 6\.7 Memory Layout', '# 7.7 Memory Layout', text)
text = re.sub(r'# 6\.8 Performance Characteristics', '# 7.8 Performance Characteristics', text)
text = re.sub(r'# 6\.9 Why This Optimization Matters', '# 7.9 Why This Optimization Matters', text)
text = re.sub(r'# 6\.10 Output of Task 6', '# 7.10 Output of Dual Mesh Construction', text)

# Insert the note at the end of dual mesh construction (Task 6/7)
text = text.replace(
'''
✅ With this optimized Task 6:

```
no polygon sorting
no trig
deterministic ordering
linear time
```

---

# 7. Polygon Vertex Ordering
''',
'''
✅ With this optimized Task 6:

```
no polygon sorting
no trig
deterministic ordering
linear time
```

**Polygon vertices are produced in correct cyclic order by the triangle-walk algorithm.**
Therefore geometric sorting is unnecessary and no angle computations or trigonometry are required.

---

# 7. Polygon Vertex Ordering
''')

# Delete # 7. Polygon Vertex Ordering entirely (including its content up to # 8)
text = re.sub(r'# 7\. Polygon Vertex Ordering.*?---\s*# 8\. Hex Uniformity Relaxation', '# 8. Hex Uniformity Relaxation', text, flags=re.DOTALL)

# Hex Relaxation Subsections
text = re.sub(r'# 9\.4 Algorithm Constants', '# 8.4 Algorithm Constants', text)
text = re.sub(r'# 8\.4 Updating Polygon Vertices', '# 8.5 Data Flow and Mutability', text)

# Replace the Updating Polygon Vertices content
old_updating = '''After all cell centers are updated for the iteration:

```
recompute polygon vertices
```

Polygon vertices are recomputed from the **triangle centers** of the underlying geodesic mesh.

This step ensures adjacency remains correct after center movement.'''

new_updating = '''The geodesic triangle mesh is immutable after generation.

Hex relaxation modifies only the dual mesh cell centers and does not mutate the original geodesic vertexBuffer.

**Polygon vertices:**
Polygon vertices are derived from `triangleCenters`. Those remain constant.
Relaxation only moves `cellCenters`.

**CRITICAL RULE:**
`triangleCenters` are computed once and never recomputed during relaxation. Recomputing them would cause O(n²) performance destruction.'''

text = text.replace(old_updating, new_updating)

text = re.sub(r'# 8\.5 Pentagons', '# 8.6 Pentagons', text)
text = re.sub(r'# 8\.6 Iteration Count', '# 8.7 Iteration Count', text)
text = re.sub(r'# 8\.7 Performance Considerations', '# 8.8 Performance Considerations', text)
text = re.sub(r'# 8\.8 Expected Result', '# 8.9 Expected Result', text)

# Tests section
old_tests = '''## Test 1 — Euler Topology

Verify mathematical correctness of the mesh:

```ts
// Expected counts for subdivision level n
const expectedFaces = 20 * n * n
const expectedVertices = 10 * n * n + 2
const expectedEdges = 30 * n * n

// Euler characteristic must equal 2
assert(V - E + F === 2)
```

## Test 2 — Cell Types

Verify correct distribution of pentagons and hexagons:

```ts
const pentagons = cells.filter(c => c.isPentagon).length
const hexagons = cells.filter(c => !c.isPentagon).length

assert(pentagons === 12)
assert(hexagons === expectedFaces - 12)
```

## Test 3 — Neighbor Count

Each cell must have correct number of neighbors:

```ts
for (const cell of cells) {
  const neighborCount = cell.neighborIndices.length
  assert(neighborCount === 5 || neighborCount === 6)
  
  if (cell.isPentagon) {
    assert(neighborCount === 5)
  } else {
    assert(neighborCount === 6)
  }
}
```'''

new_tests = '''## Test 1 — Geodesic Topology

Validate the intermediate geodesic triangle mesh.

```ts
// Expected counts for subdivision level n
const expectedVertices = 10 * n * n + 2
const expectedTriangles = 20 * n * n
const expectedEdges = 30 * n * n

// Euler characteristic must equal 2
assert(V - E + F === 2)
```

## Test 2 — Goldberg Cell Count

Validate the dual mesh.

```ts
// expected number of cells matching geodesic vertices
assert(cells.length === 10 * n * n + 2)
```

## Test 3 — Cell Types

Verify correct distribution of pentagons and hexagons:

```ts
const pentagons = cells.filter(c => c.isPentagon).length
const hexagons = cells.filter(c => !c.isPentagon).length

assert(pentagons === 12)
assert(hexagons === cells.length - 12)
```

## Test 4 — Neighbor Count

Each cell must have correct number of neighbors:

```ts
for (const cell of cells) {
  const neighborCount = cell.neighborIndices.length
  assert(neighborCount === 5 || neighborCount === 6)
  
  if (cell.isPentagon) {
    assert(neighborCount === 5)
  } else {
    assert(neighborCount === 6)
  }
}
```'''

text = text.replace(old_tests, new_tests)

# Section numbers at the end
text = re.sub(r'# 12\. Performance Profiling', '# 12. Performance Profiling', text)
text = re.sub(r'# 13\. Memory Layout', '# 13. Memory Layout', text)
text = re.sub(r'# 12\. Expected Performance', '# 14. Expected Performance', text)
text = re.sub(r'# 13\. Domain Architecture', '# 15. Domain Architecture', text)

# In Domain Architecture, remove polygon-sort.ts
text = text.replace(' │   ├─ polygon-sort.ts\n', '')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)
print("done")
