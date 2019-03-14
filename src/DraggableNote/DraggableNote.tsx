import { inject, observer } from 'mobx-react';
import React, { Component } from 'react';
import Audio from '../Audio/Audio';
import { LINE_DY, STAFF_HEIGHT, STAFF_MARGIN } from '../constants';
import RenderNote from '../RenderNote/RenderNote';
import { ProjectStore } from '../stores/project.store';
import { MouseMode, UiStore } from '../stores/ui.store';
import {
  NoteId,
  NoteLength,
  NoteOrientation,
  NoteType
} from '../types/NoteTypes';
import './DraggableNote.css';

interface DraggableNoteProps {
  id: NoteId;
  length: NoteLength;
  type: NoteType;
  orientation?: NoteOrientation;
  snapToStaff: boolean;
}

interface InjectedProps extends DraggableNoteProps {
  projectStore: ProjectStore;
  uiStore: UiStore;
}

@inject('projectStore', 'uiStore')
@observer
export default class DraggableNote extends Component<DraggableNoteProps> {
  state = {
    justPlaced: false
  };

  get injected() {
    return this.props as InjectedProps;
  }

  get noteSpec() {
    const { id } = this.props;
    const { projectStore } = this.injected;
    const noteSpecInStore = projectStore.getNoteById(id);
    if (noteSpecInStore === undefined) {
      throw new Error(`NoteSpec for note ${id} not found in project store.`);
    }
    return noteSpecInStore;
  }

  get x() {
    const { projectStore } = this.injected;
    return projectStore.getCellById(this.noteSpec.cellId)!.x;
  }

  get staffIndex() {
    const { projectStore } = this.injected;
    return projectStore.getCellById(this.noteSpec.cellId)!.staffIndex;
  }

  componentDidMount() {
    // Catch drag events when this note was just created.
    const { uiStore } = this.injected;
    if (uiStore.dragNoteId === this.noteSpec.id) {
      document.addEventListener('mouseup', this.onMouseUp);
      document.addEventListener('mousemove', this.onMouseMove);
      this.setState({ justPlaced: true });
    }
  }

  componentWillUnmount() {
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
  }

  onMouseDown = (e: React.MouseEvent<SVGRectElement>) => {
    const { uiStore } = this.injected;
    uiStore.mouseMode = MouseMode.DRAG;
    uiStore.dragNoteId = this.noteSpec.id;
    uiStore.dragStartX = this.x;
    uiStore.dragStartY = this.noteSpec.y;
    uiStore.dragStartStaffIndex = this.staffIndex;
    uiStore.dragStartClientX = e.clientX;
    uiStore.dragStartClientY = e.clientY;
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
  };

  onMouseMove = (e: MouseEvent) => {
    const { id } = this.props;
    const { projectStore, uiStore } = this.injected;
    const startingY = this.noteSpec.y;
    const {
      dragStartX,
      dragStartY,
      dragStartClientX,
      dragStartClientY
    } = uiStore;
    let { x, y } = this.getXYSnappedToStaff(
      dragStartX! + (e.clientX - dragStartClientX!),
      dragStartY! + (e.clientY - dragStartClientY!)
    );
    const staffIndexAndY = this.getNewStaffIndexAndY(y);
    const positionChanged = staffIndexAndY.y !== startingY;
    projectStore.setNotePosition(
      id,
      x,
      staffIndexAndY.y,
      staffIndexAndY.staffIndex
    );
    uiStore.activeCell = projectStore.findAdjacentCell(
      x,
      staffIndexAndY.staffIndex
    );
    uiStore.dragActiveStaffIndex = staffIndexAndY.staffIndex;

    if (positionChanged) {
      Audio.playCell(this.noteSpec.cellId!);
    }
  };

  onMouseUp = () => {
    const { uiStore, projectStore } = this.injected;
    uiStore.mouseMode = MouseMode.INSERT;

    const noteDeleted = this.x < 0;

    const noteTapped =
      uiStore.dragStartX === this.x &&
      uiStore.dragStartY === this.noteSpec.y &&
      uiStore.dragStartStaffIndex === this.staffIndex &&
      !this.state.justPlaced;

    this.setState({ justPlaced: false });

    if (noteDeleted) {
      Audio.playEffect('delete');
      projectStore.deleteNote(this.noteSpec.id);
    } else if (noteTapped) {
      Audio.playCell(this.noteSpec.cellId!);
    }

    if (uiStore.activeCell) {
      projectStore.updateNoteCell(this.noteSpec.id, uiStore.activeCell.id);
    }

    uiStore.dragNoteId = undefined;
    uiStore.dragStartX = undefined;
    uiStore.dragStartY = undefined;
    uiStore.dragStartStaffIndex = undefined;
    uiStore.activeCell = undefined;
    uiStore.dragStartClientX = undefined;
    uiStore.dragStartClientY = undefined;

    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
  };

  getXYSnappedToStaff(x: number, y: number) {
    const { type, snapToStaff } = this.props;
    if (!snapToStaff) {
      return { x, y };
    }
    if (type === NoteType.REST) {
      return {
        x,
        y: 0
      };
    } else {
      return { x, y: Math.round(y / (LINE_DY / 2)) * (LINE_DY / 2) };
    }
  }

  getNewStaffIndexAndY(y: number) {
    const staffIndex = this.injected.uiStore.dragStartStaffIndex!;
    const absoluteY = y + (staffIndex || 0) * (STAFF_HEIGHT + STAFF_MARGIN);
    const bucketSize = STAFF_HEIGHT + STAFF_MARGIN;
    const newStaffIndex = Math.round(
      (absoluteY - STAFF_MARGIN / 2) / bucketSize
    );
    const finalY = absoluteY - newStaffIndex * (STAFF_HEIGHT + STAFF_MARGIN);
    return {
      staffIndex: newStaffIndex,
      y: finalY
    };
  }

  get orientation() {
    const { y } = this.noteSpec;
    return y >= STAFF_HEIGHT / 2 ? NoteOrientation.UP : NoteOrientation.DOWN;
  }

  render() {
    const { uiStore } = this.injected;
    const { type, length } = this.props;
    const { y, id, isPlaying } = this.noteSpec;
    const dragging = uiStore.dragNoteId === id;
    return (
      <RenderNote
        cssClass="DraggableNote"
        length={length}
        type={type}
        color={isPlaying ? '#7c527c' : '#000'}
        x={this.x}
        y={y}
        orientation={this.orientation}
        isSelected={dragging}
        onMouseDown={this.onMouseDown}
        onMouseEnter={() => {
          uiStore.mouseMode = MouseMode.DRAG;
          uiStore.dragActiveStaffIndex = this.staffIndex;
        }}
        onMouseLeave={() => !dragging && (uiStore.mouseMode = MouseMode.INSERT)}
      />
    );
  }
}