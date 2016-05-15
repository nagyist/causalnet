/* eslint-env worker */

import Graph from 'egraph/graph'
import copy from 'egraph/graph/copy'
import Layouter from 'egraph/layouter/sugiyama'
import EdgeConcentrationTransformer from 'egraph/transformer/edge-concentration'
import rectangular from 'egraph/transformer/edge-concentration/rectangular'
import quasiBicliqueMining from 'egraph/transformer/edge-concentration/quasi-biclique-mining'
import layerAssignment from '../utils/layer-assignment'

const calcSize = (vertices) => {
  const left = Math.min(0, ...vertices.map(({x, width}) => x - width / 2))
  const right = Math.max(0, ...vertices.map(({x, width}) => x + width / 2))
  const top = Math.min(0, ...vertices.map(({y, height}) => y - height / 2))
  const bottom = Math.max(0, ...vertices.map(({y, height}) => y + height / 2))
  return {
    width: right - left,
    height: bottom - top
  }
}

const edgeCount = (vertices, neighbors) => {
  return neighbors.filter((u) => vertices.indexOf(u) >= 0).length
}

const transform = (graph, biclusteringOption) => {
  if (biclusteringOption === 'none') {
    return graph
  }
  const transformer = new EdgeConcentrationTransformer()
    .layerAssignment(layerAssignment(graph))
    .idGenerator((graph) => Math.max(...graph.vertices()) + 1)
    .dummy(() => ({
      dummy: true,
      name: '',
      color: '#888'
    }))
  if (biclusteringOption === 'edge-concentration') {
    transformer.method(rectangular)
  } else if (biclusteringOption === 'quasi-bicliques') {
    transformer.method((graph, h1, h2) => quasiBicliqueMining(graph, h1, h2, 0.5))
  }
  return transformer.transform(copy(graph))
}

const layout = (graph, {biclusteringOption, layerMargin, vertexMargin}) => {
  const transformedGraph = transform(graph, biclusteringOption)
  const layouter = new Layouter()
    .layerAssignment(layerAssignment(transformedGraph))
    .layerMargin(layerMargin)
    .vertexWidth(({d}) => d.dummy ? 25 : 160)
    .vertexHeight(({d}) => d.dummy ? 10 : 20)
    .vertexMargin(vertexMargin)
    .edgeWidth(() => 3)
    .edgeMargin(3)
  const positions = layouter.layout(transformedGraph)

  const vertices = []
  for (const u of transformedGraph.vertices()) {
    const d = transformedGraph.vertex(u)
    if (d.dummy) {
      d.U = transformedGraph.inVertices(u)
      d.L = transformedGraph.outVertices(u)
    }
    const {x, y, width, height} = positions.vertices[u]
    vertices.push({u, d, x, y, width, height})
  }

  const edges = []
  for (const [u, v] of transformedGraph.edges()) {
    if (positions.edges[u][v]) {
      const d = transformedGraph.edge(u, v)
      const ud = transformedGraph.vertex(u)
      const vd = transformedGraph.vertex(v)
      const {points, width, reversed} = positions.edges[u][v]
      while (points.length < 6) {
        points.push(points[points.length - 1])
      }
      let opacity
      if (ud.dummy) {
        opacity = edgeCount(ud.U, graph.inVertices(v)) / ud.U.length
      } else if (vd.dummy) {
        opacity = edgeCount(vd.L, graph.outVertices(u)) / vd.L.length
      } else {
        opacity = 1
      }
      edges.push({u, v, ud, vd, d, points, reversed, width, opacity})
    }
  }

  return Object.assign({vertices, edges}, calcSize(vertices))
}

onmessage = ({data}) => {
  const {vertices, edges, options} = data
  const graph = new Graph()
  for (const {u, d} of vertices) {
    graph.addVertex(u, d)
  }
  for (const {u, v, d} of edges) {
    graph.addEdge(u, v, d)
  }

  postMessage(layout(graph, options))
}
