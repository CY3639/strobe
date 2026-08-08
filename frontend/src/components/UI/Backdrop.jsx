/** File: client/src/components/UI/Backdrop.jsx */

import "./Modal.css";
export default function Backdrop(props) {
  return <div className="backdrop" onClick={props.onClose} />;
}
