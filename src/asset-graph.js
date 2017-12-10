const _ = require('lodash')

class Node {
  constructor (id, data) {
    this.id = id
    this.data = data
    this.links = {}
  }

  toString () {
    return this.id
  }
}

class Edge {
  constructor (id1, id2, data) {
    this.id1 = id1
    this.id2 = id2
    this.data = data
  }

  get weight () {
    return this._weight || 1
  }

  set weight (weight) {
    this._weight = weight
  }

  toString () {
    return `${this.id1} -> ${this.id2}`
  }
}

class Graph {
  constructor () {
    this.nodes = {}
    this.edges = {}
  }

  /**
   * Adds a node to the graph
   * @param  {String}     id   Node's id
   * @param  {Object}     data Payload data
   * @return {AssetGraph}      AssetGraph instance
   */
  node (id, data) {
    if (!this.nodes[id]) {
      this.nodes[id] = new Node(id, data)
    }

    return this.nodes[id]
  }

  /**
   * Adds an edge to the graph
   * @param  {String}     id1       First node's id
   * @param  {String}     id2       Second node's id
   * @param  {Object}     data      Payload data
   * @return {AssetGraph}           AssetGraph instance
   */
  edge (id1, id2, data) {
    if (!this.nodes[id1] || !this.nodes[id2]) {
      throw new Error(
        'Attempting to create an edge with a missing node: ' +
        this.nodes[id1] || this.nodes[id2]
      )
    }

    const key = `${id1}-${id2}`

    if (!this.edges[key]) {
      const edge = new Edge(id1, id2, data)

      this.edges[key] = edge
      this.nodes[id1].links[id2] = edge
    }

    return this.edges[key]
  }

  findHighestROIArbitrage (startId, minLength, maxLength) {
    function findCycles (graph, stack, node) {
      if (stack.length > maxLength) return

      const startNode = stack[0] ? graph.node(stack[0]) : null

      if (startNode && startNode.id === node.id) {
        if (stack.length < minLength) return
        return stack.concat(node.id)
      }

      return _(_.difference(_.keys(node.links), _.tail(stack)))
        .map(n => _.compact(findCycles(graph, stack.concat(node.id), graph.node(n))))
        .reduce((cycles, c) => {
          if (!c) return cycles

          return (c.length && typeof c[0] === 'string')
            ? cycles.concat([c])
            : cycles.concat(c)
        }, [])
    }

    function getEdgeStack (graph, nodeStack) {
      const edgeS = _.reduce(nodeStack, (edgeStack, nodeId) => {
        if (typeof edgeStack === 'string') {
          return [graph.edge(edgeStack, nodeId)]
        }

        const lastNodeId = edgeStack[edgeStack.length - 1].id2
        return edgeStack.concat(graph.edge(lastNodeId, nodeId))
      })

      return edgeS
    }

    return _(findCycles(this, [], this.node(startId)))
      .map(getEdgeStack.bind(null, this))
      .map(s => {
        const stackWeight = _.reduce(s, (w, e) => w * e.weight, 1)
        s.roi = Math.floor((stackWeight - 1) * 10000) / 100
        return s
      })
      .reduce((max, s) => max.roi < s.roi ? s : max)
  }

  toString () {
    return this.edges.map(e => e.toString()).join('\n')
  }
}

module.exports = Graph
