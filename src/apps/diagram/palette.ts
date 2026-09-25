// Libraries shown in the diagram editor's left sidebar. Styles are copied from
// draw.io's sidebars (grapheditor/Sidebar.js, diagramly/sidebar/Sidebar-*.js,
// Copyright (c) 2006-2025 JGraph Holdings Ltd / draw.io AG, Apache-2.0) so that
// shapes look the same in both editors.

import type { CellRecord } from './model'

// A child cell of a template (geometry relative to its parent's origin).
export interface PaletteCell {
  value?: string
  style: string
  x: number
  y: number
  width: number
  height: number
  connectable?: boolean
  children?: PaletteCell[]
}

// Vertex template, or an edge template (edge: true) that runs from
// (0, height) to (width, 0) like draw.io's edge templates.
export interface PaletteItem {
  label: string
  style: string
  width: number
  height: number
  value?: string
  edge?: boolean
  // Optional child cells (UML classes, ER tables, lists).
  children?: PaletteCell[]
  // Templates with several cells (e.g. from draw.io's libraries): the cells to
  // insert, top-level ones without parent; style/width/height then only describe the preview.
  cells?: CellRecord[]
  // Extra search words.
  tags?: string
}

export interface PaletteLibrary {
  id: string
  name: string
  items: PaletteItem[]
}

const textStyle = 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;'
const listItem = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;'
const umlField = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;'
const umlDivider = 'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=inherit;'
const lifeline = 'shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;dropTarget=0;collapsible=0;recursiveResize=0;outlineConnect=0;portConstraint=eastwest;newEdgeStyle={"curved":0,"rounded":0};'
const activation = 'html=1;points=[[0,0,0,0,5],[0,1,0,0,-5],[1,0,0,0,5],[1,1,0,0,-5]];perimeter=orthogonalPerimeter;outlineConnect=0;targetShapes=umlLifeline;portConstraint=eastwest;newEdgeStyle={"curved":0,"rounded":0};'
const hr = '<hr size="1" style="border-style:solid;"/>'
const erRow = 'text;strokeColor=none;fillColor=none;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontSize=12;whiteSpace=wrap;html=1;'
const tableRow = 'shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;'
const tableCell = 'shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;whiteSpace=wrap;html=1;'

const rows = (style: string, values: string[], width: number, height: number, y0: number): PaletteCell[] =>
  values.map((value, i) => ({ value, style, x: 0, y: y0 + i * height, width, height }))

// Row of an ER table: key column (30px) and name column.
const erTableRow = (key: string, name: string, y: number, bottom: boolean, keyStyle = ''): PaletteCell => ({
  style: tableRow + `bottom=${bottom ? 1 : 0};`,
  x: 0,
  y,
  width: 180,
  height: 30,
  children: [
    { value: key, style: tableCell + keyStyle, x: 0, y: 0, width: 30, height: 30, connectable: false },
    { value: name, style: tableCell + 'align=left;spacingLeft=6;' + keyStyle, x: 30, y: 0, width: 150, height: 30, connectable: false },
  ],
})

const lineTypes = ['classic', 'classicThin', 'block', 'blockThin', 'open', 'openThin', 'oval', 'diamond', 'diamondThin', 'dash', 'cross', 'circle', 'circlePlus', 'box', 'halfCircle', 'async', 'doubleBlock', 'baseDash']

export const PALETTE: PaletteLibrary[] = [
  {
    id: 'general',
    name: 'General',
    items: [
      { label: 'Rectangle', style: 'rounded=0;whiteSpace=wrap;html=1;', width: 120, height: 60 },
      { label: 'Rounded Rectangle', style: 'rounded=1;whiteSpace=wrap;html=1;', width: 120, height: 60 },
      { label: 'Text', style: textStyle, width: 60, height: 30, value: 'Text' },
      {
        label: 'Textbox',
        style: 'text;html=1;whiteSpace=wrap;overflow=hidden;rounded=0;',
        width: 180,
        height: 120,
        value: '<h1 style="margin-top: 0px;">Heading</h1><p>Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>',
      },
      { label: 'Ellipse', style: 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;', width: 120, height: 80 },
      { label: 'Square', style: 'whiteSpace=wrap;html=1;aspect=fixed;', width: 80, height: 80 },
      { label: 'Circle', style: 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;aspect=fixed;', width: 80, height: 80 },
      { label: 'Process', style: 'shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 120, height: 60 },
      { label: 'Diamond', style: 'rhombus;whiteSpace=wrap;html=1;shapeInside=1;', width: 80, height: 80 },
      { label: 'Parallelogram', style: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 60 },
      { label: 'Hexagon', style: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 80 },
      { label: 'Triangle', style: 'triangle;whiteSpace=wrap;html=1;shapeInside=1;', width: 60, height: 80 },
      { label: 'Cylinder', style: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;', width: 60, height: 80 },
      { label: 'Cloud', style: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;', width: 120, height: 80 },
      { label: 'Document', style: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;', width: 120, height: 80 },
      { label: 'Internal Storage', style: 'shape=internalStorage;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: 'Cube', style: 'shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;', width: 120, height: 80 },
      { label: 'Step', style: 'shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 80 },
      { label: 'Trapezoid', style: 'shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 60 },
      { label: 'Tape', style: 'shape=tape;whiteSpace=wrap;html=1;', width: 120, height: 100 },
      { label: 'Note', style: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;', width: 80, height: 100 },
      { label: 'Card', style: 'shape=card;whiteSpace=wrap;html=1;', width: 80, height: 100 },
      { label: 'Callout', style: 'shape=callout;whiteSpace=wrap;html=1;perimeter=calloutPerimeter;', width: 120, height: 80 },
      { label: 'Wedge Callout', style: 'shape=wedgeCallout;whiteSpace=wrap;html=1;', width: 120, height: 80 },
      { label: 'Actor', style: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;', width: 30, height: 60, value: 'Actor' },
      { label: 'Or', style: 'shape=xor;whiteSpace=wrap;html=1;shapeInside=1;', width: 60, height: 80 },
      { label: 'And', style: 'shape=or;whiteSpace=wrap;html=1;shapeInside=1;', width: 60, height: 80 },
      { label: 'Data Storage', style: 'shape=dataStorage;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 100, height: 80 },
      { label: 'Container', style: 'swimlane;startSize=0;', width: 200, height: 200 },
      { label: 'Vertical Container', style: 'swimlane;whiteSpace=wrap;html=1;', width: 200, height: 200, value: 'Vertical Container' },
      { label: 'Horizontal Container', style: 'swimlane;horizontal=0;whiteSpace=wrap;html=1;', width: 200, height: 200, value: 'Horizontal Container' },
      {
        label: 'List',
        style: 'swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
        width: 140,
        height: 120,
        value: 'List',
        children: rows(listItem, ['Item 1', 'Item 2', 'Item 3'], 140, 30, 30),
      },
      { label: 'List Item', style: listItem, width: 80, height: 30, value: 'List Item' },
      { label: 'Double Rectangle', style: 'shape=ext;double=1;rounded=0;whiteSpace=wrap;html=1;', width: 120, height: 80 },
      { label: 'Double Rounded Rectangle', style: 'shape=ext;double=1;rounded=1;whiteSpace=wrap;html=1;', width: 120, height: 80 },
      { label: 'Double Ellipse', style: 'ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;', width: 100, height: 60 },
      { label: 'Tape Data', style: 'shape=tapeData;whiteSpace=wrap;html=1;perimeter=ellipsePerimeter;', width: 80, height: 80 },
      { label: 'Manual Input', style: 'shape=manualInput;boundedLbl=1;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: 'Loop Limit', style: 'shape=loopLimit;whiteSpace=wrap;html=1;', width: 100, height: 80 },
      { label: 'Off Page Connector', style: 'shape=offPageConnector;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: 'Delay', style: 'shape=delay;whiteSpace=wrap;html=1;', width: 80, height: 40 },
      { label: 'Display', style: 'shape=display;whiteSpace=wrap;html=1;', width: 80, height: 40 },
      { label: 'Arrow Left', style: 'shape=singleArrow;direction=west;whiteSpace=wrap;html=1;', width: 100, height: 60 },
      { label: 'Arrow Right', style: 'shape=singleArrow;whiteSpace=wrap;html=1;', width: 100, height: 60 },
      { label: 'Arrow Up', style: 'shape=singleArrow;direction=north;whiteSpace=wrap;html=1;', width: 60, height: 100 },
      { label: 'Arrow Down', style: 'shape=singleArrow;direction=south;whiteSpace=wrap;html=1;', width: 60, height: 100 },
      { label: 'Double Arrow', style: 'shape=doubleArrow;whiteSpace=wrap;html=1;', width: 100, height: 60 },
      { label: 'Double Arrow Vertical', style: 'shape=doubleArrow;direction=south;whiteSpace=wrap;html=1;', width: 60, height: 100 },
      { label: 'User', style: 'shape=actor;whiteSpace=wrap;html=1;', width: 40, height: 60 },
      { label: 'Cross', style: 'shape=cross;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: 'Corner', style: 'shape=corner;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: 'Tee', style: 'shape=tee;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: 'Data Store', style: 'shape=datastore;whiteSpace=wrap;html=1;', width: 60, height: 60 },
      { label: 'Or (circle)', style: 'shape=orEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: 'Sum', style: 'shape=sumEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: 'Ellipse with horizontal divider', style: 'shape=lineEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: 'Ellipse with vertical divider', style: 'shape=lineEllipse;line=vertical;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: 'Sort', style: 'shape=sortShape;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: 'Collate', style: 'shape=collate;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: 'Switch', style: 'shape=switch;whiteSpace=wrap;html=1;', width: 60, height: 60 },
      { label: 'Left Curly Bracket', style: 'shape=curlyBracket;whiteSpace=wrap;html=1;rounded=1;labelPosition=left;verticalLabelPosition=middle;align=right;verticalAlign=middle;', width: 20, height: 120 },
      { label: 'Right Curly Bracket', style: 'shape=curlyBracket;whiteSpace=wrap;html=1;rounded=1;flipH=1;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;', width: 20, height: 120 },
      { label: 'Horizontal Line', style: 'line;strokeWidth=2;html=1;', width: 160, height: 10 },
      { label: 'Vertical Line', style: 'line;strokeWidth=2;direction=south;html=1;', width: 10, height: 160 },
      { label: 'Horizontal Crossbar', style: 'shape=crossbar;whiteSpace=wrap;html=1;rounded=1;', width: 120, height: 20 },
      { label: 'Isometric Cube', style: 'html=1;whiteSpace=wrap;shape=isoCube2;backgroundOutline=1;isoAngle=15;', width: 90, height: 100 },
      { label: 'Partial Rectangle', style: 'shape=partialRectangle;whiteSpace=wrap;html=1;left=0;right=0;fillColor=none;', width: 120, height: 60 },
      { label: 'Curve', style: 'curved=1;endArrow=classic;html=1;', width: 50, height: 50, edge: true },
      { label: 'Bidirectional Arrow', style: 'shape=flexArrow;endArrow=classic;startArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: 'Arrow', style: 'shape=flexArrow;endArrow=classic;html=1;', width: 50, height: 50, edge: true },
      { label: 'Dashed Line', style: 'endArrow=none;dashed=1;html=1;', width: 50, height: 50, edge: true },
      { label: 'Dotted Line', style: 'endArrow=none;dashed=1;html=1;dashPattern=1 3;strokeWidth=2;', width: 50, height: 50, edge: true },
      { label: 'Line', style: 'endArrow=none;html=1;', width: 50, height: 50, edge: true },
      { label: 'Bidirectional Connector', style: 'endArrow=classic;startArrow=classic;html=1;', width: 50, height: 50, edge: true },
      { label: 'Directional Connector', style: 'endArrow=classic;html=1;', width: 50, height: 50, edge: true },
      { label: 'Link', style: 'shape=link;html=1;', width: 100, height: 0, edge: true },
    ],
  },
  {
    id: 'flowchart',
    name: 'Flowchart',
    items: [
      { label: 'Annotation 1', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.annotation_1;align=left;pointerEvents=1;', width: 50, height: 100 },
      { label: 'Annotation 2', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.annotation_2;align=left;labelPosition=right;pointerEvents=1;', width: 50, height: 100 },
      { label: 'Card', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=card;whiteSpace=wrap;size=20;arcSize=12;', width: 100, height: 60 },
      { label: 'Collate', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.collate;', width: 100, height: 100 },
      { label: 'Data', style: 'shape=parallelogram;html=1;strokeWidth=2;perimeter=parallelogramPerimeter;whiteSpace=wrap;rounded=1;arcSize=12;size=0.23;', width: 100, height: 60 },
      { label: 'Database', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.database;whiteSpace=wrap;', width: 60, height: 60 },
      { label: 'Decision', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.decision;whiteSpace=wrap;', width: 100, height: 100 },
      { label: 'Delay', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.delay;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Direct Data', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.direct_data;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Display', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.display;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Document', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.document2;whiteSpace=wrap;size=0.25;', width: 100, height: 60 },
      { label: 'Extract or Measurement', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.extract_or_measurement;whiteSpace=wrap;', width: 95, height: 60 },
      { label: 'Internal Storage', style: 'shape=internalStorage;whiteSpace=wrap;html=1;dx=15;dy=15;rounded=1;arcSize=8;strokeWidth=2;', width: 70, height: 70 },
      { label: 'Loop Limit', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.loop_limit;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Manual Input', style: 'html=1;strokeWidth=2;shape=manualInput;boundedLbl=1;whiteSpace=wrap;rounded=1;size=26;arcSize=11;', width: 100, height: 60 },
      { label: 'Manual Operation', style: 'verticalLabelPosition=middle;verticalAlign=middle;html=1;shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;size=0.23;arcSize=10;flipV=1;labelPosition=center;align=center;', width: 100, height: 60 },
      { label: 'Merge or Storage', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.merge_or_storage;whiteSpace=wrap;', width: 95, height: 60 },
      { label: 'Multi-Document', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.multi-document;whiteSpace=wrap;boundedLbl=1;', width: 88, height: 60 },
      { label: 'Off-Page Reference', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=offPageConnector;rounded=0;size=0.5;', width: 60, height: 60 },
      { label: 'On-Page Reference', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.on-page_reference;', width: 60, height: 60 },
      { label: 'Or', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.or_2;', width: 70, height: 70 },
      { label: 'Tape', style: 'shape=tape;whiteSpace=wrap;html=1;strokeWidth=2;size=0.19', width: 100, height: 65 },
      { label: 'Parallel Mode', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.parallel_mode;accentColor=#ffff00;pointerEvents=1', width: 95, height: 40 },
      { label: 'Predefined Process', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=process;whiteSpace=wrap;rounded=1;size=0.14;arcSize=6;', width: 100, height: 60 },
      { label: 'Preparation', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=hexagon;perimeter=hexagonPerimeter2;arcSize=6;size=0.27;', width: 100, height: 60 },
      { label: 'Process', style: 'rounded=1;whiteSpace=wrap;html=1;absoluteArcSize=1;arcSize=14;strokeWidth=2;', width: 100, height: 100 },
      { label: 'Sequential Data', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.sequential_data;whiteSpace=wrap;', width: 100, height: 100 },
      { label: 'Sort', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.sort;', width: 100, height: 100 },
      { label: 'Start 1', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.start_1;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Start 2', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.start_2;whiteSpace=wrap;', width: 100, height: 100 },
      { label: 'Stored Data', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.stored_data;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Summing Junction', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.summing_junction;', width: 70, height: 70 },
      { label: 'Terminator', style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.terminator;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Transfer', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;strokeWidth=2;shape=mxgraph.arrows2.arrow;dy=0.6;dx=40;notch=0;', width: 100, height: 70 },
    ],
  },
  {
    id: 'arrows',
    name: 'Arrows & Connectors',
    items: [
      { label: 'Straight', style: 'endArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: 'Orthogonal', style: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;', width: 100, height: 100, edge: true },
      { label: 'Rounded Orthogonal', style: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;', width: 100, height: 100, edge: true },
      { label: 'Curved', style: 'edgeStyle=orthogonalEdgeStyle;curved=1;orthogonalLoop=1;jettySize=auto;html=1;', width: 100, height: 100, edge: true },
      { label: 'Horizontal Elbow', style: 'edgeStyle=elbowEdgeStyle;elbow=horizontal;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;', width: 100, height: 100, edge: true },
      { label: 'Vertical Elbow', style: 'edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;', width: 100, height: 100, edge: true },
      { label: 'Entity Relation', style: 'edgeStyle=entityRelationEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;', width: 100, height: 100, edge: true },
      { label: 'Manual Line', style: 'edgeStyle=segmentEdgeStyle;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;', width: 100, height: 100, edge: true },
      { label: 'Line', style: 'endArrow=none;html=1;', width: 100, height: 100, edge: true },
      { label: 'Dashed Line', style: 'endArrow=none;dashed=1;html=1;', width: 100, height: 100, edge: true },
      { label: 'Dotted Line', style: 'endArrow=none;dashed=1;html=1;dashPattern=1 3;strokeWidth=2;', width: 100, height: 100, edge: true },
      { label: 'Dashed Arrow', style: 'endArrow=classic;dashed=1;html=1;', width: 100, height: 100, edge: true },
      { label: 'Bidirectional', style: 'endArrow=classic;startArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: 'Flex Arrow', style: 'shape=flexArrow;endArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: 'Flex Bidirectional Arrow', style: 'shape=flexArrow;endArrow=classic;startArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: 'Link', style: 'shape=link;html=1;', width: 100, height: 0, edge: true },
      ...lineTypes.map((type) => ({ label: `Arrow: ${type}`, style: `endArrow=${type};endFill=1;html=1;`, width: 100, height: 0, edge: true })),
      ...lineTypes
        .filter((type) => !/^(open|dash|cross|halfCircle|baseDash)/.test(type))
        .map((type) => ({ label: `Arrow: ${type} (hollow)`, style: `endArrow=${type};endFill=0;html=1;`, width: 100, height: 0, edge: true })),
    ],
  },
  {
    id: 'uml',
    name: 'UML',
    items: [
      {
        label: 'Class',
        style: 'swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
        width: 160,
        height: 86,
        value: 'Classname',
        children: [
          { value: '+ field: type', style: umlField, x: 0, y: 26, width: 160, height: 26 },
          { value: '', style: umlDivider, x: 0, y: 52, width: 160, height: 8 },
          { value: '+ method(type): type', style: umlField, x: 0, y: 60, width: 160, height: 26 },
        ],
      },
      {
        label: 'Class 2',
        style: 'swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=26;fillColor=none;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
        width: 140,
        height: 104,
        value: 'Classname',
        children: rows(umlField, ['+ field: type', '+ field: type', '+ field: type'], 140, 26, 26),
      },
      { label: 'Item', style: umlField, width: 100, height: 26, value: '+ item: attribute' },
      { label: 'Divider', style: umlDivider, width: 40, height: 8 },
      {
        label: 'Class (HTML)',
        style: 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;',
        width: 160,
        height: 90,
        value: `<p style="margin:0px;margin-top:4px;text-align:center;"><b>Class</b></p>${hr}<p style="margin:0px;margin-left:4px;">+ field: Type</p>${hr}<p style="margin:0px;margin-left:4px;">+ method(): Type</p>`,
      },
      {
        label: 'Interface',
        style: 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;',
        width: 190,
        height: 140,
        value: `<p style="margin:0px;margin-top:4px;text-align:center;"><i>&lt;&lt;Interface&gt;&gt;</i><br/><b>Interface</b></p>${hr}<p style="margin:0px;margin-left:4px;">+ field1: Type<br/>+ field2: Type</p>${hr}<p style="margin:0px;margin-left:4px;">+ method1(Type): Type<br/>+ method2(Type, Type): Type</p>`,
      },
      { label: 'Interface (simple)', style: 'html=1;whiteSpace=wrap;', width: 110, height: 50, value: '&laquo;interface&raquo;<br><b>Name</b>' },
      { label: 'Object', style: 'html=1;whiteSpace=wrap;', width: 110, height: 50, value: 'Object' },
      {
        label: 'Object Instance',
        style: 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;',
        width: 160,
        height: 90,
        value: `<p style="margin:0px;margin-top:4px;text-align:center;text-decoration:underline;"><b>Object:Type</b></p>${hr}<p style="margin:0px;margin-left:8px;">field1 = value1<br/>field2 = value2<br>field3 = value3</p>`,
      },
      { label: 'Package', style: 'shape=folder;fontStyle=1;spacingTop=10;tabWidth=40;tabHeight=14;tabPosition=left;html=1;whiteSpace=wrap;', width: 70, height: 50, value: 'package' },
      { label: 'Module', style: 'shape=module;align=left;spacingLeft=20;align=center;verticalAlign=top;whiteSpace=wrap;html=1;', width: 100, height: 50, value: 'Module' },
      {
        label: 'Component',
        style: 'html=1;dropTarget=0;whiteSpace=wrap;',
        width: 180,
        height: 90,
        value: '&laquo;Annotation&raquo;<br/><b>Component</b>',
        children: [{ style: 'shape=module;jettyWidth=8;jettyHeight=4;', x: 153, y: 7, width: 20, height: 20 }],
      },
      { label: 'Component (shape)', style: 'shape=component;align=left;spacingLeft=36;rounded=0;dashed=0;html=1;whiteSpace=wrap;', width: 150, height: 60, value: 'Component' },
      { label: 'Block', style: 'verticalAlign=top;align=left;spacingTop=8;spacingLeft=2;spacingRight=12;shape=cube;size=10;direction=south;fontStyle=4;html=1;whiteSpace=wrap;', width: 180, height: 120, value: 'Block' },
      { label: 'Note', style: 'shape=note2;boundedLbl=1;whiteSpace=wrap;html=1;size=25;verticalAlign=top;align=center;', width: 120, height: 60, value: 'Note' },
      { label: 'Actor', style: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;', width: 30, height: 60, value: 'Actor' },
      { label: 'Use Case', style: 'ellipse;whiteSpace=wrap;html=1;', width: 140, height: 70, value: 'Use Case' },
      { label: 'Boundary Object', style: 'shape=umlBoundary;whiteSpace=wrap;html=1;', width: 100, height: 80, value: 'Boundary Object' },
      { label: 'Entity Object', style: 'ellipse;shape=umlEntity;whiteSpace=wrap;html=1;', width: 80, height: 80, value: 'Entity Object' },
      { label: 'Control Object', style: 'ellipse;shape=umlControl;whiteSpace=wrap;html=1;', width: 70, height: 80, value: 'Control Object' },
      { label: 'Provided/Required Interface', style: 'shape=providedRequiredInterface;html=1;verticalLabelPosition=bottom;sketch=0;', width: 20, height: 20 },
      { label: 'Required Interface', style: 'shape=requiredInterface;html=1;verticalLabelPosition=bottom;sketch=0;', width: 10, height: 20 },
      { label: 'Provided Interface', style: 'shape=lollipop;html=1;verticalLabelPosition=bottom;verticalAlign=top;', width: 10, height: 20 },
      { label: 'Start', style: 'ellipse;html=1;shape=startState;fillColor=#000000;strokeColor=#ff0000;', width: 30, height: 30 },
      { label: 'Activity', style: 'rounded=1;whiteSpace=wrap;html=1;arcSize=40;fontColor=#000000;fillColor=#ffffc0;strokeColor=#ff0000;', width: 120, height: 40, value: 'Activity' },
      { label: 'Condition', style: 'rhombus;whiteSpace=wrap;html=1;fontColor=#000000;fillColor=#ffffc0;strokeColor=#ff0000;', width: 80, height: 40, value: 'Condition' },
      { label: 'Fork/Join', style: 'shape=line;html=1;strokeWidth=6;strokeColor=#ff0000;', width: 200, height: 10 },
      { label: 'End', style: 'ellipse;html=1;shape=endState;fillColor=#000000;strokeColor=#ff0000;', width: 30, height: 30 },
      { label: 'Lifeline', style: lifeline, width: 100, height: 300, value: ':Object' },
      { label: 'Actor Lifeline', style: lifeline + 'participant=umlActor;', width: 20, height: 300 },
      { label: 'Boundary Lifeline', style: lifeline + 'participant=umlBoundary;', width: 50, height: 300 },
      { label: 'Entity Lifeline', style: lifeline + 'participant=umlEntity;', width: 40, height: 300 },
      { label: 'Control Lifeline', style: lifeline + 'participant=umlControl;', width: 40, height: 300 },
      { label: 'Activation Bar', style: activation, width: 10, height: 80 },
      { label: 'Frame', style: 'shape=umlFrame;whiteSpace=wrap;html=1;pointerEvents=0;', width: 300, height: 200, value: 'frame' },
      { label: 'Destruction', style: 'shape=umlDestroy;whiteSpace=wrap;html=1;strokeWidth=3;targetShapes=umlLifeline;', width: 30, height: 30 },
      { label: 'Synchronous Message', style: 'html=1;verticalAlign=bottom;endArrow=block;curved=0;rounded=0;', width: 80, height: 0, value: 'dispatch', edge: true },
      { label: 'Return Message', style: 'html=1;verticalAlign=bottom;endArrow=open;dashed=1;endSize=8;curved=0;rounded=0;', width: 80, height: 0, value: 'return', edge: true },
      { label: 'Found Message', style: 'html=1;verticalAlign=bottom;startArrow=oval;startFill=1;endArrow=block;startSize=8;curved=0;rounded=0;', width: 60, height: 0, edge: true },
      { label: 'Dependency', style: 'endArrow=open;endSize=12;dashed=1;html=1;', width: 160, height: 0, value: 'Use', edge: true },
      { label: 'Generalization', style: 'endArrow=block;endSize=16;endFill=0;html=1;', width: 160, height: 0, value: 'Extends', edge: true },
      { label: 'Implementation', style: 'endArrow=block;dashed=1;endFill=0;endSize=12;html=1;', width: 160, height: 0, edge: true },
      { label: 'Association', style: 'endArrow=open;endFill=1;endSize=12;html=1;', width: 160, height: 0, edge: true },
      { label: 'Bidirectional Association', style: 'endArrow=block;startArrow=block;endFill=1;startFill=1;html=1;', width: 160, height: 0, edge: true },
      { label: 'Aggregation', style: 'endArrow=diamondThin;endFill=0;endSize=24;html=1;', width: 160, height: 0, edge: true },
      { label: 'Composition', style: 'endArrow=diamondThin;endFill=1;endSize=24;html=1;', width: 160, height: 0, edge: true },
      { label: 'Aggregation (with multiplicity)', style: 'endArrow=open;html=1;endSize=12;startArrow=diamondThin;startSize=14;startFill=0;edgeStyle=orthogonalEdgeStyle;align=left;verticalAlign=bottom;', width: 160, height: 0, value: '1', edge: true },
      { label: 'Composition (with multiplicity)', style: 'endArrow=open;html=1;endSize=12;startArrow=diamondThin;startSize=14;startFill=1;edgeStyle=orthogonalEdgeStyle;align=left;verticalAlign=bottom;', width: 160, height: 0, value: '1', edge: true },
      { label: 'Inner Class', style: 'endArrow=open;startArrow=circlePlus;endFill=0;startFill=0;endSize=8;html=1;', width: 160, height: 0, edge: true },
      { label: 'Terminate', style: 'endArrow=open;startArrow=cross;endFill=0;startFill=0;endSize=8;startSize=10;html=1;', width: 160, height: 0, edge: true },
    ],
  },
  {
    id: 'er',
    name: 'Entity Relation',
    items: [
      {
        label: 'Table',
        style: 'shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;',
        width: 180,
        height: 150,
        value: 'Table',
        children: [
          erTableRow('PK', 'UniqueID', 30, true, 'fontStyle=1;'),
          erTableRow('', 'Row 1', 60, false),
          erTableRow('', 'Row 2', 90, false),
          erTableRow('', 'Row 3', 120, false),
        ],
      },
      {
        label: 'Entity (Attributes)',
        style: 'swimlane;childLayout=stackLayout;horizontal=1;startSize=50;horizontalStack=0;rounded=1;fontSize=14;fontStyle=0;strokeWidth=2;resizeParent=0;resizeLast=1;shadow=0;dashed=0;align=center;arcSize=4;whiteSpace=wrap;html=1;',
        width: 160,
        height: 120,
        value: 'Entity',
        children: [
          {
            value: '+Attribute1<br>+Attribute2<br>+Attribute3',
            style: 'align=left;strokeColor=none;fillColor=none;spacingLeft=4;spacingRight=4;fontSize=12;verticalAlign=top;resizable=0;rotatable=0;part=1;html=1;whiteSpace=wrap;',
            x: 0,
            y: 50,
            width: 160,
            height: 70,
          },
        ],
      },
      {
        label: 'List',
        style: 'swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;align=center;fontSize=14;',
        width: 160,
        height: 116,
        value: 'List',
        children: rows(erRow, ['Item 1', 'Item 2', 'Item 3'], 160, 30, 26),
      },
      { label: 'List Item', style: erRow, width: 40, height: 30, value: 'Item' },
      { label: 'Entity', style: 'whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: 'Entity' },
      { label: 'Entity (Rounded)', style: 'rounded=1;arcSize=10;whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: 'Entity' },
      { label: 'Weak Entity', style: 'shape=ext;margin=3;double=1;whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: 'Entity' },
      { label: 'Attribute', style: 'ellipse;whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: 'Attribute' },
      { label: 'Key Attribute', style: 'ellipse;whiteSpace=wrap;html=1;align=center;fontStyle=4;', width: 100, height: 40, value: 'Attribute' },
      { label: 'Weak Key Attribute', style: 'ellipse;whiteSpace=wrap;html=1;align=center;fontStyle=20;', width: 100, height: 40, value: 'Attribute' },
      { label: 'Derived Attribute', style: 'ellipse;whiteSpace=wrap;html=1;align=center;dashed=1;', width: 100, height: 40, value: 'Attribute' },
      { label: 'Multivalue Attribute', style: 'ellipse;shape=doubleEllipse;margin=3;whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: 'Attribute' },
      { label: 'Associative Entity', style: 'shape=associativeEntity;whiteSpace=wrap;html=1;align=center;', width: 140, height: 60, value: 'Associative<br>Entity' },
      { label: 'Relationship', style: 'shape=rhombus;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;align=center;', width: 120, height: 60, value: 'Relationship' },
      { label: 'Identifying Relationship', style: 'shape=rhombus;double=1;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;align=center;', width: 120, height: 60, value: 'Relationship' },
      { label: 'Cloud', style: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;align=center;', width: 100, height: 60, value: 'Cloud' },
      { label: 'Note', style: 'shape=note;size=20;whiteSpace=wrap;html=1;', width: 100, height: 100, value: 'Note' },
      { label: '0 to Many Optional', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToMany;endFill=1;', width: 100, height: 100, edge: true },
      { label: '1 to Many', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;', width: 100, height: 100, edge: true },
      { label: '1 Mandatory', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: '1 to 1', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmandOne;startArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: '1', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERone;endFill=1;', width: 100, height: 100, edge: true },
      { label: '0 to 1', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToOne;endFill=1;', width: 100, height: 100, edge: true },
      { label: 'Many', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmany;', width: 100, height: 100, edge: true },
      { label: 'Many to Many', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmany;startArrow=ERmany;', width: 100, height: 100, edge: true },
      { label: '1 Optional to Many Optional', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToMany;startArrow=ERzeroToOne;', width: 100, height: 100, edge: true },
      { label: '1 Mandatory to Many Optional', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToMany;startArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: '1 Mandatory to 1 Optional', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToOne;startArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: '1 Mandatory to Many Mandatory', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: '1 Optional to Many Mandatory', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERzeroToOne;', width: 100, height: 100, edge: true },
      { label: 'Many Mandatory to Many Mandatory', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERoneToMany;', width: 100, height: 100, edge: true },
      { label: 'Many Optional to Many Mandatory', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERzeroToMany;', width: 100, height: 100, edge: true },
      { label: 'Many Optional to Many Optional', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToMany;endFill=1;startArrow=ERzeroToMany;', width: 100, height: 100, edge: true },
      { label: 'Relation', style: 'endArrow=none;html=1;rounded=0;', width: 160, height: 0, edge: true },
      { label: 'Optional Participation', style: 'endArrow=none;html=1;rounded=0;dashed=1;dashPattern=1 2;', width: 160, height: 0, edge: true },
      { label: 'Recursive Relationship', style: 'shape=link;html=1;rounded=0;', width: 160, height: 0, edge: true },
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    items: [
      { label: 'Partial Rectangle 1', style: 'shape=partialRectangle;whiteSpace=wrap;html=1;top=0;bottom=0;fillColor=none;', width: 120, height: 60 },
      { label: 'Partial Rectangle 2', style: 'shape=partialRectangle;whiteSpace=wrap;html=1;right=0;top=0;bottom=0;fillColor=none;routingCenterX=-0.5;', width: 120, height: 60 },
      { label: 'Partial Rectangle 3', style: 'shape=partialRectangle;whiteSpace=wrap;html=1;bottom=0;right=0;fillColor=none;', width: 120, height: 60 },
      { label: 'Partial Rectangle 4', style: 'shape=partialRectangle;whiteSpace=wrap;html=1;top=0;left=0;fillColor=none;', width: 120, height: 60 },
      { label: '6 Point Star', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.6_point_star', width: 100, height: 90 },
      { label: '8 Point Star', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.8_point_star', width: 100, height: 100 },
      { label: 'Banner', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.banner', width: 100, height: 50 },
      { label: 'Cloud Callout', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.cloud_callout', width: 90, height: 60 },
      { label: 'Cloud Rectangle', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.cloud_rect', width: 120, height: 90 },
      { label: 'Cone', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.cone', width: 100, height: 100 },
      { label: 'Document', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.document', width: 100, height: 100 },
      { label: 'Donut', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.donut;dx=25;', width: 100, height: 100 },
      { label: 'Drop', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.drop', width: 70, height: 100 },
      { label: 'Flash', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.flash', width: 60, height: 100 },
      { label: 'Half Circle', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.half_circle', width: 100, height: 50 },
      { label: 'Heart', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.heart', width: 100, height: 100 },
      { label: 'Loud Callout', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.loud_callout', width: 100, height: 60 },
      { label: 'Moon', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.moon', width: 75, height: 100 },
      { label: 'No Symbol', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.no_symbol', width: 100, height: 100 },
      { label: 'Octagon', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.octagon2;align=center;verticalAlign=middle;dx=15;', width: 100, height: 100 },
      { label: 'Orthogonal Triangle', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.orthogonal_triangle', width: 100, height: 70 },
      { label: 'Acute Triangle', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.acute_triangle;dx=0.5;', width: 100, height: 70 },
      { label: 'Obtuse Triangle', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.obtuse_triangle;dx=0.25;', width: 100, height: 70 },
      { label: 'Oval Callout', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.oval_callout', width: 100, height: 60 },
      { label: 'Pentagon', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.pentagon', width: 100, height: 90 },
      { label: 'Pointed Oval', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.pointed_oval', width: 50, height: 100 },
      { label: 'Diagonal Snip Rectangle', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.diag_snip_rect;dx=6;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Diagonal Rounded Rectangle', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.diag_round_rect;dx=6;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Corner Rounded Rectangle', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.corner_round_rect;dx=6;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Plaque', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.plaque;dx=6;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Frame', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.frame;dx=10;whiteSpace=wrap;', width: 100, height: 60 },
      { label: 'Rectangular Callout', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.rectCallout;dx=30;dy=15;boundedLbl=1;', width: 100, height: 60 },
      { label: 'Rounded Rectangular Callout', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.roundRectCallout;dx=30;dy=15;size=5;boundedLbl=1;', width: 100, height: 60 },
      { label: 'Layered Rectangle', style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.layered_rect;dx=10;outlineConnect=0;boundedLbl=1;', width: 100, height: 60 },
      { label: 'Smiley', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.smiley', width: 100, height: 100 },
      { label: 'Star', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.star', width: 100, height: 95 },
      { label: 'Sun', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.sun', width: 100, height: 100 },
      { label: 'Tick', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.tick', width: 85, height: 100 },
      { label: 'X', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.x', width: 100, height: 100 },
      { label: 'Message', style: 'shape=message;html=1;html=1;outlineConnect=0;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;', width: 60, height: 40 },
      { label: 'Cylinder Stack', style: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;lid=0;', width: 60, height: 80 },
    ],
  },
]
