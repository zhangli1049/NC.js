/* 
 * Copyright (c) 2016-2017 by STEP Tools Inc. 
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import ViewerControls   from './viewer_controls';
import CompassView      from '../compass/compass';

export default class GeometryView extends React.Component {
  constructor(props) {
    super(props);

    this.state = {oldColors: {}};

    this._addqueue = {};
    this._removequeue = {};

    this.invalidate = this.invalidate.bind(this);
    this.alignToolView = this.alignToolView.bind(this);
    this.alignCamera = this.alignCamera.bind(this);
    this.alignFixture = this.alignFixture.bind(this);
    this.highlightFaces = this.highlightFaces.bind(this);
    this.onShellLoad = this.onShellLoad.bind(this);
    this.onRootModelAdd = this.onRootModelAdd.bind(this);
    this.onRootModelRemove = this.onRootModelRemove.bind(this);
    this.onQueueFlush = this.onQueueFlush.bind(this);
    this.onModelAdd = this.onModelAdd.bind(this);
    this.onModelRemove = this.onModelRemove.bind(this);
    this.zoomToFit = this.zoomToFit.bind(this);
    this.addListeners = this.addListeners.bind(this);
    this.onClearScene = this.onClearScene.bind(this);
  }

  componentDidMount() {
    // RENDERER
    this.canvasParent = $(this.props.parentSelector);
    this.canvas = $(this.props.parentSelector + ' .cadjs-canvas');

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas[0],
      antialias: true,
      alpha: false,
    });
    this.renderer.setClearColor(new THREE.Color(0x000000), 1);
    this.renderer.sortObjects = true;
    this.renderer.autoClear = false;

    // SCENES
    this.geometryScene = new THREE.Scene();
    this._globalxform = new THREE.Matrix4();
    this._globalxform.set(
      -1, 0, 0, 0,
       0, 0, 1, 0,
       0, 1, 0, 0,
       0, 0, 0, 1
    );
    //this.geometryScene.applyMatrix(m);
    this.annotationScene = new THREE.Scene();
    
    //this.annotationScene.applyMatrix(m);

    this.overlayScene = new THREE.Scene();

    this.geometryScene.applyMatrix(this._globalxform);
    this.annotationScene.applyMatrix(this._globalxform);
    this.overlayScene.applyMatrix(this._globalxform);

    // CAMERA
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.canvasParent[0].offsetWidth / this.canvasParent[0].offsetHeight,
      0.1,
      1000000
    );
    
    this.camera.position.x = -5000;
    this.camera.position.y = -5000;
    this.camera.position.z = 0;
    this.camera.lookAt(this.geometryScene.position);

    // VIEW CONTROLS
    this.controls =  new ViewerControls({
      viewer: this,
      camera: this.camera,
      canvas: this.renderer.domElement,
    });
    this.addListeners();

    if (this.props.defaultView) {
      let m = new THREE.Matrix4();
      m.fromArray(this.props.defaultView);
      this.camera.applyMatrix(m);
    }
    // SCREEN RESIZE
    this.forceUpdate();
    this.animate(true);
    this.handleResize();
  }

  addListeners() {
    // CONTROL EVENT HANDLERS
    this.controls.addEventListener('change', (options) => {
      let x0 = this.sceneCenter;
      let x1 = this.camera.position;
      let x2 = this.controls.target;
      let x2subX1 = x2.clone().sub(x1);
      let x1subX0 = x1.clone().sub(x0);
      let c = x2subX1.clone().cross(x1subX0).lengthSq() / x2subX1.lengthSq();
      let d = Math.sqrt(Math.abs(c - x1subX0.lengthSq()));

      this.camera.near = Math.max(0.1, d - this.sceneRadius);
      this.camera.far = d + this.sceneRadius;
      this.camera.updateProjectionMatrix();
      if (!options.noInvalidate) {
        this.invalidate();
      }
    });
    this.controls.addEventListener('start', () => {
      this.continuousRendering = true;
      if (this.props.viewType === 'cadjs') {
        this.props.lockedCb(false);
      }
    });
    this.controls.addEventListener('end', () => {
      this.invalidate();
      this.continuousRendering = false;
    });
  }

  zoomToFit(object) {
    if (!object) {
      return;
    }
    let object3d = object.getObject3D();
    let boundingBox = object.getBoundingBox();
    let radius = 0;
    if (this.props.viewType === 'preview') {
      radius = boundingBox.size().length() * 0.75;
    } else {
      radius = boundingBox.size().length() * 0.5;
    }
    let fovRad = THREE.Math.degToRad(this.camera.fov * 0.5);
    let horizontalFOV = 2 * Math.atan(fovRad * this.camera.aspect);
    let fov = Math.min(THREE.Math.degToRad(this.camera.fov), horizontalFOV);
    let dist = radius / Math.sin(fov * 0.5);
    let newTargetPosition = boundingBox.max.clone().
      lerp(boundingBox.min, 0.5).
      applyMatrix4(object3d.matrixWorld);
    this.camera.position
      .sub(this.controls.target)
      .setLength(dist)
      .add(newTargetPosition);
    this.controls.target.copy(newTargetPosition);
    this.invalidate();
  }

  componentWillUpdate(nextProps) {
    let highlightColors = {
      'default': {r: 1.0, g: 0, b: 1.0}, // pink
      'A': {r: 1.0, g: 0.6, b: 0.0}, // orange
      'B': {r: 0.0, g: 0.92, b: 0.0}, // green
      'C': {r: 0.6, g: 0.0, b: 0.6}, // purple
      'D': {r: 0.0, g: 0.0, b: 1.0}, // blue
      'E': {r: .92, g: .92, b: 0.0}, // yellow
      'F': {r: 0.0, g: 1.0, b: 1.0}, // cyan
      'G': {r: 0.92, g: 0.0, b: 0.0}, // red
    };

    let rootModelName = 'state/key';
    if (this.props.viewType === 'preview') {
      rootModelName = this.props.previewEntity.id;
    }

    if (this.props.viewType === 'preview') {
      // unhighlight old faces first if we're switching entities
      this.highlightFaces(
        this.props.selectedEntity.faces,
        this.props.manager.getRootModel(rootModelName),
        true
      );
    }

    // unhighlight old faces
    let faces = [];
    _.each(this.props.highlightedTolerances, (tol) => {
      let tolerance = this.props.toleranceCache[tol];
      faces = faces.concat(tolerance.faces);
    });
    let rootModel = this.props.manager.getRootModel(rootModelName);
    this.highlightFaces(faces, rootModel, true);

    if (this.props.viewType === 'preview') {
      rootModelName = nextProps.previewEntity.id;
    }

    // now highlight new faces
    if (nextProps.viewType !== 'preview' ||
        nextProps.selectedEntity.type !== 'tolerance') {
      // now highlight tolerances selected
      _.each(nextProps.highlightedTolerances, (tol) => {

        let tolerance = nextProps.toleranceCache[tol];

        let color = highlightColors[tolerance.name];
        if (!color) {
          color = highlightColors['default'];
        }
        let status;
        if (tolerance.status === 'tolerance green') {
          color = { r: 0.0, g: 1.0, b: 0.0 };
          status='green';
        } else if (tolerance.status === 'tolerance red') {
          color = { r: 1.0, g: 0.0, b: 0.0 };
          status='red';
        }
        this.highlightFaces(
          tolerance.faces,
          nextProps.manager.getRootModel(rootModelName),
          false,
          color,
          status
        );
      });
    } else if (nextProps.viewType === 'preview' &&
               nextProps.selectedEntity.type === 'tolerance') {
      _.each(nextProps.highlightedTolerances, (tol) => {

        let tolerance = nextProps.toleranceCache[tol];
        if (tolerance.type === 'datum' &&
            _.find(nextProps.selectedEntity.children, (child) => child.id === tol)) {
          let color = highlightColors[tolerance.name];
          if (!color) {
            color = highlightColors['default'];
          }

          this.highlightFaces(
            tolerance.faces,
            nextProps.manager.getRootModel(rootModelName),
            false,
            color
          );
        }
      });
    }

    // for previewing a tolerance, highlight its faces
    if (nextProps.viewType === 'preview') {
      if (nextProps.selectedEntity && nextProps.selectedEntity.type === 'tolerance') {

        let color = highlightColors[nextProps.selectedEntity.name];
        if (!color) {
          color = highlightColors['default'];
        }

        this.highlightFaces(
          nextProps.selectedEntity.faces,
          nextProps.manager.getRootModel(nextProps.selectedEntity.workpiece),
          false,
          color
        );
      }
    }
  }

  componentWillMount() {
    this.sceneCenter = new THREE.Vector3(0,0,0);
    this.sceneRadius = 10000;
    if (!window.setDefaultView) {
      window.setDefaultView = () => {
        let m = this.camera.matrix.toArray();
        request.put('/v3/nc/geometry/view')
          .send(m)
          .then(() => {
            console.log("Updated defaultView matrix to" + m);
          });
      };
    }
    this.props.manager.addEventListener('rootModel:add', this.onRootModelAdd);
    this.props.manager.addEventListener('rootModel:remove', this.onRootModelRemove);
    this.props.manager.addEventListener('model:add', this.onModelAdd);
    this.props.manager.addEventListener('model:remove', this.onModelRemove);
    this.props.manager.addEventListener('model:flush', this.onQueueFlush);
    this.props.manager.addEventListener('shellLoad', this.onShellLoad);
    this.props.manager.addEventListener('shapeLoad', this.onShellLoad);
    this.props.manager.addEventListener('clearScene', this.onClearScene);
    this.props.manager.addEventListener('annotationLoad', this.invalidate);
    this.props.manager.addEventListener('invalidate', this.invalidate);
    this.props.manager.app.actionManager.on('invalidate',this.invalidate);
  }

  componentWillUnmount() {
    this.props.manager.removeEventListener('rootModel:add', this.onRootModelAdd);
    this.props.manager.removeEventListener('rootModel:remove', this.onRootModelRemove);
    this.props.manager.removeEventListener('model:add', this.onModelAdd);
    this.props.manager.removeEventListener('model:remove', this.onModelRemove);
    this.props.manager.removeEventListener('model:flush', this.onQueueFlush);
    this.props.manager.removeEventListener('shellLoad', this.onShellLoad);
    this.props.manager.removeEventListener('shapeLoad', this.onShellLoad);
    this.props.manager.removeEventListener('clearScene', this.onClearScene);
    this.props.manager.removeEventListener('annotationLoad', this.invalidate);
    this.props.manager.removeEventListener('invalidate', this.invalidate);
    this.props.manager.app.actionManager.removeListener('invalidate',this.invalidate);
  }

  componentDidUpdate() {
    if (this.props.resize) {
      this.handleResize();
    }

    if (this.props.locked && this.props.viewType === 'cadjs') {
      this.alignToolView(this.props.manager.getRootModel('state/key'));
      this.invalidate();
    }
  }

  onShellLoad(event) {
    this.forceUpdate();
    // Get around the fact that viewerControls calls change a bunch at startup
    this.invalidate(event);
  }

  onModelAdd(event){
    if(this.props.viewType !== event.viewType){
      return;
    }
    if(!this._addqueue[event.sequence]) this._addqueue[event.sequence] = [];
    this._addqueue[event.sequence].push(event.model);
  }
  onQueueFlush(event){
    _.each(this._removequeue[event.sequence],(obj)=>{
      this.geometryScene.remove(obj.getGeometry());
    });
    delete this._removequeue[event.sequence];
    _.each(this._addqueue[event.sequence],(obj)=>{
      this.geometryScene.add(obj.getGeometry());
    });
    delete this._addqueue[event.sequence];
//    this.forceUpdate();
  }
  onModelRemove(event){
    if(this.props.viewType !== event.viewType){
      return;
    }
    if(!this._removequeue[event.sequence]) this._removequeue[event.sequence] = [];
    this._removequeue[event.sequence].push(event.model);
//    this.forceUpdate();
  }
  onRootModelAdd(event) {
    if (this.props.viewType !== event.viewType) {
      return;
    }

    //This is where the NC model is being loaded into the CADview
    let model = this.props.manager.getRootModel(event.path);
    // Add the model to the scene
    this.annotationScene.add(model.getAnnotation3D());
    this.geometryScene.add(model.getObject3D());
    this.overlayScene.add(model.getOverlay3D());
    // calculate the scene's radius for draw distance calculations
    this.updateSceneBoundingBox(model.getBoundingBox());

    if(!this.props.defaultView)
      this.zoomToFit(model);
  }

  onRootModelRemove(event) {
    console.log('RootModelRemove: ' + event.path);
  }

  onClearScene(event){
    _.each(this.geometryScene.children,(obj)=>{
      this.geometryScene.remove(obj);
    });
  }

  handleResize() {
    let width = this.canvasParent.innerWidth();
    let height = this.canvasParent.innerHeight();
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.controls.handleResize();
    this.controls.dispatchEvent({type: 'change'});
    this.drawScene();
  }

  static getAxisVector(vec) {
    // Find the closest axis-aligned unit vector to the given vector
    let absVec = new THREE.Vector3(
      Math.abs(vec.x),
      Math.abs(vec.y),
      Math.abs(vec.z)
    );
    let rtn = new THREE.Vector3(0, 0, 0);

    if (absVec.x >= absVec.y && absVec.x >= absVec.z) {
      if (vec.x > 0) {
        rtn.x = 1;
      } else {
        rtn.x = -1;
      }
    } else if (absVec.y >= absVec.x && absVec.y >= absVec.z) {
      if (vec.y > 0) {
        rtn.y = 1;
      } else {
        rtn.y = -1;
      }
    } else if (absVec.z >= absVec.x && absVec.z >= absVec.y) {
      if (vec.z > 0) {
        rtn.z = 1;
      } else {
        rtn.z = -1;
      }
    }

    return rtn;
  }

  alignToolView(nc) {
    if (nc === undefined) {
      return;
    }

    // find the orientation of the referenced object
    let curobjs = nc.getCurrentObjects();
    let tools = _.filter(
      _.values(curobjs),
      {'usage': 'cutter'}
    );
    let part = _.find(
      _.values(curobjs),
      {'usage': 'tobe'}
    );
    if (part === undefined) {
      part = _.find(
        _.values(curobjs),
        {'usage': 'asis'}
      );
    }
    let toolBox = new THREE.Box3();
    let minz = Infinity;
    let up = new THREE.Vector3();
    _.each(tools,(tool)=>{
      let toolbb = tool.getBoundingBox();
      toolBox.union(toolbb);
      if(toolbb.min.z <minz) {
        up = tool.getUpVector();
        minz = toolbb.min.z;
      }
    })

    if(toolBox.max.x === -Infinity) return;
    let toolMax = toolBox.max.clone();
    let toolMin = toolBox.min.clone();

    // get the unit vector corresponding to this view
    let toolAxis = GeometryView.getAxisVector(up);

    let newUp = toolAxis.clone();


    // now calculate which side we want to view from
    // TODO: make sure fixtures work properly with machines and other changes
    let machine = _.find(
      _.values(curobjs),
      {'usage': 'machine'}
    );
    let fixture = _.find(
      _.values(curobjs),
      {'usage': 'fixture'}
    );
    let newPos = new THREE.Vector3();
    if (machine) {
      newPos.crossVectors(newUp, new THREE.Vector3(-1, 0, 0));
    } else {
      this.alignFixture(fixture, newUp, newPos);
    }
    newUp = newUp.applyMatrix4(this.geometryScene.matrixWorld).normalize();

    newPos = newPos.applyMatrix4(this.geometryScene.matrixWorld).normalize();

    // TODO: See if we can actually use the tool in calculations
    // zoom to fit just the part
    let newTargetPosition = this.alignCamera(part, toolBox);
    
    this.controls.target.copy(newTargetPosition);
    this.controls.alignTop(newUp, newPos);
  }

  alignFixture(fixture, newUp, newPos) {
    if (fixture === undefined) {
      newPos.crossVectors(newUp, new THREE.Vector3(1, 0, 0));
      if (newPos.length() === 0) {
        newPos.crossVectors(newUp, new THREE.Vector3(0, 1, 0));
      }
      return;
    }

    let fixtureMax = fixture.bbox.max.clone();
    let fixtureMin = fixture.bbox.min.clone();
    let fixtureDiag = fixtureMax.clone().sub(fixtureMin);

    let fixturePos = fixture.object3D.position.clone();

    let fixLen = GeometryView.getAxisVector(fixtureDiag);

    newPos.crossVectors(fixLen, newUp);
    if (newPos.length() === 0) {
      if (newUp.x === 0) {
        newPos.x = 1;
      } else {
        newPos.y = 1;
      }
    }

    // make sure the fixture is facing away from us
    // if it would block view of the part
    if (fixturePos.dot(newPos) < 0) {
      newPos.negate();
    }
  }

  alignCamera(part, toolBox) {
    let boundingBox = new THREE.Box3()
      .union(part.getBoundingBox())
      .union(toolBox);
    let radius = boundingBox.size().length() * 0.5;
    let fovRad = THREE.Math.degToRad(this.camera.fov * 0.5);
    let horizontalFOV = 2 * Math.atan(fovRad * this.camera.aspect);
    let fov = Math.min(THREE.Math.degToRad(this.camera.fov), horizontalFOV);
    let dist = radius / Math.sin(fov * 0.5);
    let newTargetPosition = boundingBox.max.clone().lerp(boundingBox.min, 0.5);

    // adjust the camera position based on the new target
    this.camera.position
        .sub(this.controls.target)
        .setLength(dist)
        .add(newTargetPosition);

    return newTargetPosition;
  }

  highlightFaces(faces, nc, unhighlight, newColor,status) {
    if (!nc) {
      return;
    }

    let shapes = _.filter(
      _.flatten(_.values(nc.getCurrentObjects())),
      _.matches({usage: 'tobe'}) || _.matches({usage: 'asis'}));

    _.each(shapes, (shape) => {
      let id = shape.getID(); 
      _.each(shape.getShells(), (shell) => {
        let modelFaces = shell.getFaces();
        let colors = shell.getGeometry().getAttribute('color');
        if (!unhighlight && !this.state.oldColors[id]) {
          let oldColors = this.state.oldColors;
          oldColors[id] = colors.clone();
          this.setState({ 'oldColors': oldColors });
        }
        let foundFaces = _.filter(faces,(f)=>{return !(modelFaces[f]===undefined)});
        _.each(foundFaces,(face)=>{
          for(let i = modelFaces[face].start;i<=modelFaces[face].end;i++){
            if (unhighlight && this.state.oldColors[id]) {
              colors.array[i*3] = this.state.oldColors[id].array[i*3];
              colors.array[(i*3) + 1] = this.state.oldColors[id].array[(i*3) + 1];
              colors.array[(i*3) + 2] = this.state.oldColors[id].array[(i*3) + 2];
            } else if (!unhighlight) {
              if ((status === 'green' || status === 'red') && (colors.array[i*3] === 1.0 && colors.array[(i*3) + 1] === 1.0 && colors.array[(i*3) + 2] === 0.0)) {//Face has yellow status- show it yellow.
                //nop
              } else if (status === 'green' && colors.array[i*3] === 1.0 && colors.array[(i*3) + 1] === 0.0 && colors.array[(i*3) + 2] == 0.0) { //Face has red status, adding green status- show it yellow.
                colors.array[(i*3) + 1] = 1.0;
              } else if (status === 'red' && colors.array[i*3] === 0.0 && colors.array[(i*3) + 1] === 1.0 && colors.array[(i*3) + 2] == 0.0) { //Face has green status, adding red status- show it yellow.
                colors.array[i*3] = 1.0;
              } else {
                colors.array[(i*3)] = newColor.r;
                colors.array[(i*3) + 1] = newColor.g;
                colors.array[(i*3) + 2] = newColor.b;
              }
            }
          }
        });

        colors.needsUpdate = true;
        this.invalidate();
      });
    });
  }
  
  animate(forceRendering) {
    window.requestAnimationFrame(() => {
      this.animate(false);
    });
    if (this.continuousRendering === true
      || this.shouldRender === true
      || forceRendering === true) {
      if (this.props.locked && this.props.viewType === 'cadjs') {
        this.alignToolView(this.props.manager.getRootModel('state/key'));
      }
      this.shouldRender = false;
      this.drawScene();
      this.controls.update();
      // Tell anyone listening to update their view
      this.props.manager.dispatchEvent({type: 'render:update'});
    }
  }

  updateSceneBoundingBox(newBoundingBox) {
    this.sceneCenter.copy(newBoundingBox.center());
    this.sceneRadius = newBoundingBox.size().length() / 2;
  }

  drawScene() {
    this.renderer.clear();
    this.renderer.render(this.geometryScene, this.camera);
    this.renderer.render(this.overlayScene, this.camera);
    this.renderer.render(this.annotationScene, this.camera);
  }

  invalidate(options) {
    if (options) {
      if (options.boundingBox) {
        // then update the bounding box for the new model
        this.updateSceneBoundingBox(options.model.getBoundingBox());
        this.controls.dispatchEvent({type: 'change', 'noInvalidate': true});
      }
    }
    this.shouldRender = true;
  }

  render() {
    let compass = undefined; 
    if(this.camera!==undefined){
      compass = (
        <CompassView
          camera={this.camera}
          controls={this.controls}
          dispatcher={this.props.manager}
          guiMode={this.props.guiMode}
          parentSelector={this.props.parentSelector + ' .geometry-container'}
        />);
    }
    return (
      <div className='geometry-container'>
        <canvas
          className='cadjs-canvas'
          onMouseUp={this.props.onMouseUp}
          onMouseMove={this.onMouseMove}
        />
        {compass}
      </div>
    );
  }
};
