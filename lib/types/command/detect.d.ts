/**
 * Project detection for `/test auto`: read the working directory's manifests and
 * propose the suite declaration a project of that shape would want. Detection
 * only proposes commands the project already declares; it never invents one.
 * @module @deepseek-ai/dsh-command-test/detect
 */
/** One detected check the project can run. */
export interface DetectedCheck {
    /** Human-readable case name. */
    readonly name: string;
    /** Command that runs it. */
    readonly command: string;
    /** Detected suite label. */
    readonly suite: string;
}
/** What detection found in one project directory. */
export interface Detection {
    /** Project shape that was recognized. */
    readonly projectType: string;
    /** Checks the project declares. */
    readonly checks: readonly DetectedCheck[];
}
/**
 * Detect the checks a project directory declares.
 * @param directory - the session working directory.
 * @returns the detection result.
 */
export declare function detectProject(directory: string): Promise<Detection>;
/**
 * Render a detection as the YAML declaration a human can paste and run.
 * @param detection - what detection found.
 * @param directory - the directory that was inspected, used in the heading.
 * @returns the report text.
 */
export declare function describeDetection(detection: Detection, directory: string): string;
