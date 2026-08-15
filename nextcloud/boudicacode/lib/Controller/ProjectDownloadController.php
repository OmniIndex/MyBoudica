<?php

namespace OCA\BoudicaCode\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\NotFoundResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\FileInfo;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\IUserSession;
use ZipArchive;

/**
 * Zips a project folder (or the whole home folder, if no path given)
 * and streams it back as a download. Uses Nextcloud's own Files API
 * (IRootFolder) rather than re-reading via WebDAV, so this runs
 * entirely server-side against the same storage backend Nextcloud
 * itself uses — no dependency on any other app's download endpoint.
 */
class ProjectDownloadController extends Controller {

    private IRootFolder $rootFolder;
    private IUserSession $userSession;

    public function __construct(
        string $appName,
        IRequest $request,
        IRootFolder $rootFolder,
        IUserSession $userSession
    ) {
        parent::__construct($appName, $request);
        $this->rootFolder = $rootFolder;
        $this->userSession = $userSession;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * @param string $path - project folder path relative to the user's
     *   home, e.g. "Projects/my-app". Empty string = whole home folder.
     */
    public function download(string $path = ''): Response {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new NotFoundResponse();
        }

        // Basic traversal guard — Nextcloud's Folder::get() also
        // refuses to escape the user's storage, but fail fast anyway.
        if (str_contains($path, '..')) {
            return new NotFoundResponse();
        }

        try {
            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            $targetNode = $path === '' ? $userFolder : $userFolder->get($path);
        } catch (NotFoundException $e) {
            return new NotFoundResponse();
        }

        if (!($targetNode instanceof Folder)) {
            return new NotFoundResponse();
        }

        $tmpZipPath = tempnam(sys_get_temp_dir(), 'boudicacode-zip-');
        $zip = new ZipArchive();
        $zip->open($tmpZipPath, ZipArchive::OVERWRITE);

        $this->addFolderToZip($targetNode, $zip, '');
        $zip->close();

        $zipContent = file_get_contents($tmpZipPath);
        unlink($tmpZipPath);

        $downloadName = ($path === '' ? 'project' : basename($path)) . '.zip';

        $response = new DataDisplayResponse($zipContent, 200, [
            'Content-Type' => 'application/zip',
            'Content-Disposition' => 'attachment; filename="' . $downloadName . '"',
        ]);
        return $response;
    }

    private function addFolderToZip(Folder $folder, ZipArchive $zip, string $zipPrefix): void {
        foreach ($folder->getDirectoryListing() as $node) {
            $entryName = $zipPrefix === '' ? $node->getName() : "{$zipPrefix}/{$node->getName()}";

            if ($node->getType() === FileInfo::TYPE_FOLDER && $node instanceof Folder) {
                $zip->addEmptyDir($entryName);
                $this->addFolderToZip($node, $zip, $entryName);
            } elseif ($node instanceof \OCP\Files\File) {
                $zip->addFromString($entryName, $node->getContent());
            }
        }
    }
}
