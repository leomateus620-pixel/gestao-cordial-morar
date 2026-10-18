import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, RotateCcw } from "lucide-react";
import type { PublicTour } from "@/lib/cordial-site/contract";
import { mediaPath } from "@/lib/cordial-site/presentation";
import { useSiteBrand } from "@/lib/cordial-site/context";
import { changeTourView, initialTourView, type TourView } from "@/lib/cordial-site/tour-view";
import "./property-tour.css";

const vertex = `attribute vec2 position;varying vec2 point;void main(){point=position;gl_Position=vec4(position,0.0,1.0);}`;
const fragment = `precision mediump float;varying vec2 point;uniform sampler2D panorama;uniform float aspect;uniform float yaw;uniform float pitch;uniform float fov;
void main(){float scale=tan(fov*.5);vec3 r=normalize(vec3(point.x*aspect*scale,point.y*scale,-1.0));
vec3 p=vec3(r.x,r.y*cos(pitch)-r.z*sin(pitch),r.y*sin(pitch)+r.z*cos(pitch));
vec3 d=vec3(p.x*cos(yaw)-p.z*sin(yaw),p.y,p.x*sin(yaw)+p.z*cos(yaw));
vec2 uv=vec2(fract(atan(d.x,-d.z)/6.28318530718+.5),asin(clamp(d.y,-1.0,1.0))/3.14159265359+.5);
gl_FragColor=texture2D(panorama,uv);}`;

export default function PanoramaViewer({ tour }: { tour: PublicTour }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const render = useRef<(() => void) | null>(null);
  const view = useRef<TourView>({ ...initialTourView });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  const brand = useSiteBrand();
  const source = mediaPath(tour.media, "full", brand);
  const move = (delta: Partial<TourView>) => {
    view.current = changeTourView(view.current, delta);
    render.current?.();
  };
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const gl = target.getContext("webgl", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setStatus("fallback");
      return;
    }
    let disposed = false;
    let program: WebGLProgram | null = null;
    let texture: WebGLTexture | null = null;
    let buffer: WebGLBuffer | null = null;
    const shaders: WebGLShader[] = [];
    const shader = (type: number, source: string) => {
      const value = gl.createShader(type);
      if (!value) throw new Error("shader");
      shaders.push(value);
      gl.shaderSource(value, source);
      gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error("shader");
      return value;
    };
    const image = new Image();
    const fail = () => {
      if (!disposed) {
        render.current = null;
        setStatus("fallback");
      }
    };
    const lost = (event: Event) => {
      event.preventDefault();
      fail();
    };
    target.addEventListener("webglcontextlost", lost);
    let observer: ResizeObserver | null = null;
    try {
      program = gl.createProgram();
      if (!program) throw new Error("program");
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("program");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      if (!texture) throw new Error("texture");
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      const locations = {
        yaw: gl.getUniformLocation(program, "yaw"),
        pitch: gl.getUniformLocation(program, "pitch"),
        fov: gl.getUniformLocation(program, "fov"),
        aspect: gl.getUniformLocation(program, "aspect"),
      };
      render.current = () => {
        if (disposed || !target.clientWidth || !target.clientHeight) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.round(target.clientWidth * dpr),
          height = Math.round(target.clientHeight * dpr);
        if (target.width !== width || target.height !== height) {
          target.width = width;
          target.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.uniform1f(locations.aspect, width / height);
        gl.uniform1f(locations.yaw, (view.current.yaw * Math.PI) / 180);
        gl.uniform1f(locations.pitch, (view.current.pitch * Math.PI) / 180);
        gl.uniform1f(locations.fov, (view.current.fov * Math.PI) / 180);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };
      image.onload = () => {
        if (disposed) return;
        // The gateway rechecks permission and strips EXIF; verify the decoded aspect too.
        if (
          image.naturalWidth !== image.naturalHeight * 2 ||
          image.naturalWidth > gl.getParameter(gl.MAX_TEXTURE_SIZE)
        ) {
          fail();
          return;
        }
        try {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
          if (gl.getError() !== gl.NO_ERROR) {
            fail();
            return;
          }
          setStatus("ready");
          render.current?.();
          observer = new ResizeObserver(() => render.current?.());
          observer.observe(target);
        } catch {
          fail();
        }
      };
      image.onerror = fail;
      image.src = source;
    } catch {
      fail();
    }
    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
      image.src = "";
      render.current = null;
      observer?.disconnect();
      target.removeEventListener("webglcontextlost", lost);
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      if (program) gl.deleteProgram(program);
      for (const shader of shaders) gl.deleteShader(shader);
    };
  }, [source]);
  const key = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const action: Record<string, Partial<TourView>> = {
      ArrowLeft: { yaw: -15 },
      ArrowRight: { yaw: 15 },
      ArrowUp: { pitch: 10 },
      ArrowDown: { pitch: -10 },
      "+": { fov: -5 },
      "-": { fov: 5 },
    };
    if (event.key === "Home") {
      event.preventDefault();
      view.current = { ...initialTourView };
      render.current?.();
    } else if (action[event.key]) {
      event.preventDefault();
      move(action[event.key]);
    }
  };
  return (
    <div className="cs-tour-viewer">
      {status === "fallback" ? (
        <>
          <p role="status">
            A visualização 360° não está disponível neste navegador. Veja o panorama como
            fotografia.
          </p>
          <img
            src={source}
            alt="Panorama equiretangular revisado do imóvel"
            width={tour.media.width ?? 1920}
            height={tour.media.height ?? 960}
            loading="lazy"
          />
        </>
      ) : (
        <div className="cs-tour-frame">
          <canvas
            ref={canvas}
            tabIndex={0}
            aria-label="Panorama 360 graus do imóvel. Use as setas para explorar; mais e menos para aproximar; Home para reiniciar."
            onKeyDown={key}
            onPointerDown={(event) => {
              if (status !== "ready") return;
              drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (!start || start.id !== event.pointerId) return;
              const dx = event.clientX - start.x,
                dy = event.clientY - start.y;
              start.x = event.clientX;
              start.y = event.clientY;
              move({ yaw: -dx * 0.15, pitch: dy * 0.15 });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
          />
          {status === "loading" && (
            <p role="status" className="cs-tour-loading">
              Carregando panorama…
            </p>
          )}
        </div>
      )}
      {status === "ready" && (
        <div className="cs-tour-controls" role="group" aria-label="Controles do tour 360 graus">
          {(
            [
              { label: "Olhar à esquerda", icon: ArrowLeft, delta: { yaw: -15 } },
              { label: "Olhar à direita", icon: ArrowRight, delta: { yaw: 15 } },
              { label: "Olhar para cima", icon: ArrowUp, delta: { pitch: 10 } },
              { label: "Olhar para baixo", icon: ArrowDown, delta: { pitch: -10 } },
              { label: "Aproximar", icon: Plus, delta: { fov: -5 } },
              { label: "Afastar", icon: Minus, delta: { fov: 5 } },
            ] as const
          ).map(({ label, icon: Icon, delta }) => (
            <button
              key={label}
              type="button"
              className="cs-button cs-button-light"
              aria-label={label}
              title={label}
              onClick={() => move(delta)}
            >
              <Icon size={18} />
              <span className="cs-tour-control-label">{label}</span>
            </button>
          ))}
          <button
            type="button"
            className="cs-button cs-button-light"
            onClick={() => {
              view.current = { ...initialTourView };
              render.current?.();
            }}
          >
            <RotateCcw size={18} />
            Reiniciar
          </button>
        </div>
      )}
    </div>
  );
}
