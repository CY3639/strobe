/** File: client/src/components/UI/Modal.jsx */

import { Fragment } from "react";
import ReactDOM from "react-dom";
import "./Modal.css";
import Backdrop from "./Backdrop";

const ModalOverlay = (props) => {
  return (
    <div className={`modal ${props.className || ""}`.trim()}>
      <div>{props.children}</div>
    </div>
  );
};

const portalElement = document.getElementById("overlays");

const Modal = (props) => {
  return (
    <Fragment>
      {ReactDOM.createPortal(
        <Backdrop onClose={props.onClose} />,
        portalElement
      )}
      {ReactDOM.createPortal(
        <ModalOverlay onClose={props.onClose} className={props.className}>{props.children}</ModalOverlay>,
        portalElement
      )}
    </Fragment>
  );
};

export default Modal;
