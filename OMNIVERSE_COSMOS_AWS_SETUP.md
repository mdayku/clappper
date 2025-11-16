# NVIDIA Omniverse + Cosmos Setup Guide (AWS EC2)

**Target:** AWS EC2 GPU instance for AI video generation pipeline  
**Estimated Cost:** ~$1-2/hour on-demand (g5 instances)  
**Setup Time:** 60-90 minutes

---

## Top Priorities (Working Checklist)

These are the **live, high-priority tasks** for the Omniverse + Cosmos work. Treat this section as the day-to-day checklist.

**Completed so far:**  
- Phase 0 (Pre-Flight).  
- Phase 1 (EC2 host + SSH).  
- Phase 2 (GPU drivers, CUDA, Docker + NVIDIA toolkit).  
- Windows `g5.xlarge` Omniverse authoring instance with:
  - RDP access and NVIDIA driver installed.
  - `kit-app-template`-based Kit app (`mdayku`) with Movie Capture extensions.
  - S3-backed asset library bucket (`clappper-assets`) mounted via rclone as Z: drive.
  - **Asset catalog complete**: 3,092 unique USD assets across 14 packs with metadata and tags.
  - Video compilation workflow: PNG sequences → MP4 via FFmpeg.
  - Hero scenes created with 240-frame sequence captures compiled to video.

**Parallel track (UI):** A separate Windows `g5.xlarge` instance with GPU drivers and Omniverse tools is used as an **interactive authoring + capture workstation** (RDP + GUI), while the Ubuntu instance remains the **headless render + Cosmos pipeline** engine.

### Current Stage – Phase 3: Omniverse

There are now **two complementary options** for Omniverse capture. Both can coexist; Option A is active today, Option B remains a stretch goal.

#### Option A – Windows Kit App (Authoring + Capture) **← current path**

- [x] **3A.1 Windows Omniverse authoring instance**
  - [x] Launch Windows `g5.xlarge` instance and enable RDP.
  - [x] Install NVIDIA data center driver and verify `nvidia-smi` in PowerShell.
- [x] **3A.2 Kit app via `kit-app-template`**
  - [x] Clone `kit-app-template` onto the Windows instance.
  - [x] Create and launch a minimal Kit app (`mdayku`) via `repo.bat template new` → `repo.bat build` → `repo.bat launch`.
- [x] **3A.3 S3 asset sync**
  - [x] Install AWS CLI on the Windows instance and configure credentials.
  - [x] Sync `s3://clappper-assets` to `C:\Users\Administrator\Documents\clappper-assets`.
  - [x] Load Pixar USD examples and project assets from the synced folder.
- [x] **3A.4 Scene library seed**
  - [x] Promote at least one example scene to `scenes/` (e.g. `simple_shading_card.usd`).
  - [x] Confirm the scene opens and renders correctly inside the Kit app.
- [x] **3A.5 Manual still capture**
  - [x] Configure viewport capture to write PNGs into `C:\Users\Administrator\Documents\renders`.
  - [x] Capture at least one clean plate (no overlays) and sync `renders/` to `s3://clappper-assets/renders/`.
- [x] **3A.6 Upgrade to video / sequence capture**
  - [x] Enable capture-friendly extensions in the app's `.kit` file (`omni.kit.window.movie_capture`, `omni.kit.capture.viewport`) and rebuild.
  - [x] Use the Movie/Capture UI to export image sequences (240-frame sequence captured).
  - [x] Compile PNG sequences to MP4 using FFmpeg (`compile_sequence.py` script).
- [x] **3A.7 Asset catalog generation**
  - [x] Build comprehensive asset inventory with metadata, tags, and S3 paths.
  - [x] Generate master index JSON for LLM querying (3,092 unique assets across 14 packs).
  - [x] Sync catalog to S3: `s3://clappper-assets/omniverse_assets/asset_catalog/`.
- [ ] **3A.8 LLM → USD script generation workflow**
  - [ ] Test workflow: User describes scene → LLM queries catalog → checks asset availability → generates USD Python script.
  - [ ] Run generated script in Kit to create scene automatically.
  - [ ] Capture and compile video from generated scene.

#### Option B – Ubuntu Headless Kit Container (Render Service) **← blocked / stretch**

- [x] **3B.1 Base packages & workspace**
  - [x] Install dependencies: `wget`, `curl`, `git`, `python3`, `pip`, `ffmpeg`, X11 libs.
  - [x] Create working directories: `~/omniverse` and `~/clappper-render`.
- [ ] **3B.2 Omniverse Kit container**
  - [ ] Create or sign in to an NGC account at `ngc.nvidia.com`.
  - [ ] Generate an NGC API key (`nvapi-...`) from **Setup → API Keys** in the NGC web UI.
  - [ ] Log in to `nvcr.io` with:
    - Username: `$oauthtoken` (literally this string)
    - Password: your NGC API key
  - [ ] Pull Omniverse Kit container: `nvcr.io/nvidia/omniverse-kit:latest`.
    - _Note: If you see **“error from registry: Access Denied”**, your NGC account is not entitled to this image and you must request access in the NGC catalog or use the non-container Omniverse setup path._
- [ ] **3B.3 Test scene & render script**
  - [ ] Create `test.usda` and `render_kit.py` in `~/clappper-render`.
- [ ] **3B.4 Headless render validation**
  - [ ] Run test render via Docker as in this guide.
  - [ ] Confirm output frames show up in `~/clappper-render/output/`.

#### Asset Library & ChatUSD (Shared Across Phases 3–5)

> Detailed design lives in `ASSET_USD_PLAN`; this section summarizes how it fits into the AWS/S3 architecture.

- [ ] **3C.1 Define canonical asset root (S3-first, EC2 as cache)**
  - [ ] Use S3 as the **source of truth** for all USD assets to avoid running out of local disk on EC2:
    - Canonical root: `s3://clappper-assets/omniverse_assets/`
    - Windows authoring mount: `C:\Users\Administrator\Documents\omniverse_assets\` (synced from S3).
    - Future Ubuntu/headless mount: `/mnt/omniverse_assets/` (synced from S3 when needed).
  - [ ] Establish a minimal folder layout under the root:
    - `packs/` – NVIDIA/Pixar/third-party asset packs (unzipped).
    - `scenes/` – curated scenes and hero shots.
    - `products/` – your own product USDs / placeholders.
    - `scratch/` – temporary stages and experiment outputs.
- [ ] **3C.2 NVIDIA + Pixar asset ingestion (S3-centric)**
  - [ ] Download a **curated subset** of NVIDIA Omniverse/OpenUSD Asset Packs (environments, interiors, props) to a local working machine or the Windows instance.
  - [ ] Unzip into a staging folder, then upload/sync into:
    - `s3://clappper-assets/omniverse_assets/packs/{pack_name}/...`
  - [ ] Normalize existing Pixar USD content so it lives under `packs/pixar/...` in the same S3 root.
  - [ ] On the Windows instance, `aws s3 sync` only the packs/scenes you need onto local disk, and delete local copies after promotion to S3 when space gets tight (S3 remains the canonical store).
- [ ] **3C.3 Hero scenes and products**
  - [ ] Promote 3–5 high-quality scenes (from NVIDIA packs or Pixar examples) into `omniverse_assets/scenes/` with stable names (e.g. `interior_loft_v1.usd`, `bookshelf_v1.usd`).
  - [ ] Create a `products/placeholder/` folder with simple stand-in product USDs (box-on-pedestal, etc.) to support early “product hero” shots.
  - [ ] For each hero scene, capture at least one clean plate (no overlays) into `renders/` and sync to `s3://clappper-assets/renders/`.
- [ ] **3C.4 Shot metadata catalog**
  - [ ] Define a simple `shots/` JSON schema (stored in S3, e.g. `s3://clappper-assets/omniverse_assets/shots/{scene_id}.json`) that maps:
    - `scene_id` → USD path under `omniverse_assets/scenes/`.
    - Default camera name and framing info.
    - One or more default PNG or sequence paths under `renders/`.
    - Tags/notes (`["interior","loft","warm"]`, etc.).
  - [ ] Create shot descriptors for each promoted hero scene; keep this catalog as the bridge between the web app / Cosmos planner and the Omniverse scenes.
- [x] **3C.5 ChatUSD / LLM-based USD generation (alternative approach implemented)**
  - **Status:** The `omni.ai.chat_usd.bundle` extension is not available in the Kit SDK registries (similar to Cosmos access issue).
  - **Implemented alternative:** External LLM (Claude, GPT, etc.) generates USD Python scripts based on:
    1. User's natural language scene description
    2. Asset availability check against the S3 catalog
    3. Iterative refinement until all required assets are confirmed available
    4. Generated Python script that uses USD API to compose scene + configure capture
  - [x] **Asset inventory complete**: 3,092 unique USD assets cataloged with metadata, tags, and S3 paths.
  - [x] **Master index JSON** created at `s3://clappper-assets/omniverse_assets/asset_catalog/master_index.json`.
  - [x] **Asset distribution**: Warehouse (2,340), Furniture (490), Residential (66), Commercial (32), Characters (28), plus environments, particles, demos.
  - [ ] **Test LLM workflow**: Describe scene → LLM checks catalog → generates Python script → run in Kit → validate automated scene + render generation.

### Next Stage – Phase 4: Cosmos

> **Status:** Blocked as of Nov 2025 – the NVIDIA account currently lacks sufficient permissions/entitlements for Cosmos (NVCF / NIM). These tasks stay on the roadmap but cannot be completed until access is granted.

- [ ] **4.1 Local Python environment for Cosmos**
  - [ ] Ensure `python3` and `pip` are installed and working on EC2.
- [ ] **4.2 Choose Cosmos path**
  - [ ] Decide between hosted API, NIM container, or open-weights repo (subject to account access).
  - [ ] Implement one path end-to-end and produce a test video file.
- [ ] **4.3 Validate Cosmos output**
  - [ ] Confirm a minimal request succeeds and outputs a playable video.

### Phase Overview (0–7) – Reference Plan

Use this as the project PRD/task map; the rest of the document provides detailed commands.

1. **Phase 0 – Pre-Flight & Decisions**
   - AWS prerequisites: account, IAM user for CLI, region `us-east-1`.
   - Local tooling: AWS CLI, SSH, VS Code Remote SSH.
   - Choices: Cosmos path (hosted API vs NIM vs open weights) and app integration (Flask API vs direct SSH).
2. **Phase 1 – EC2 GPU Host (AWS)**
   - Security group (`clappper-omniverse-sg`).
   - Key pair (`clappper-omniverse-key2`) and `.ssh` setup.
   - Launch `g5.xlarge` with 500GB `gp3`, tag `omniverse-render`, confirm SSH access.
3. **Phase 2 – GPU Stack (Drivers, CUDA, Docker)**
   - NVIDIA driver via `ubuntu-drivers autoinstall`.
   - CUDA 12.x install and verification.
   - Docker + NVIDIA Container Toolkit and GPU test container.
4. **Phase 3 – Omniverse (Headless via Container)**
   - Base packages + workspace directories.
   - Omniverse Kit container pulled from NGC.
   - Minimal USD scene + headless render script.
   - Successful test render to disk.
5. **Phase 4 – Cosmos**
   - Decide path (hosted API, NIM, or open weights).
   - Implement one working path end-to-end and produce a test video.
6. **Phase 5 – Clappper Integration Providers**
   - `omniverse_provider.sh` wrapper for headless Omniverse.
   - `cosmos_provider.py` wrapper for Cosmos.
   - End-to-end Omniverse → Cosmos pipeline producing a video.
7. **Phase 6 – HTTP / Web App Integration**
   - Remote dev via VS Code SSH.
   - Flask API on EC2 or direct SSH from Next.js API routes.
   - Web app triggers renders and retrieves outputs.
   - Configure auto-shutdown CloudWatch alarms/Lambda to stop idle EC2 instances (Ubuntu headless + Windows Omniverse UI) after ~30 minutes of low CPU.
8. **Phase 7 – Cost Management & QoL**
   - Refine auto-shutdown behavior and thresholds if needed.
   - Start/stop helper scripts, optional Elastic IP.
   - Final README / ops documentation.

---

## Why AWS Instead of Local?

Your laptop constraints:
- ✅ RTX 4050 works, but only 6GB VRAM (Omniverse wants 8GB+)
- ⚠️ 227GB free is tight (Omniverse ~50GB, Cosmos ~30GB, cache ~20GB)
- ⚠️ Laptop thermals/battery drain during rendering

AWS advantages:
- 💪 Better GPU (A10G 24GB VRAM on g5.xlarge)
- 💾 Elastic storage (500GB+ EBS volumes)
- 🔥 On-demand scaling (turn off when not rendering)
- 🌐 Public IP for web app demos

---

## Part 1: Launch AWS EC2 GPU Instance

### Step 1: Choose Instance Type (5 min)

**Recommended:** `g5.xlarge`
- GPU: NVIDIA A10G (24GB VRAM, Ampere architecture)
- vCPU: 4
- RAM: 16GB
- Cost: ~$1.01/hr on-demand (us-east-1)
- Perfect for Omniverse + Cosmos

**Alternative:** `g5.2xlarge` if you need more CPU/RAM (~$1.21/hr)

### Step 2: Launch Instance (10 min)

```bash
# From your local terminal (PowerShell):

# 1. Install AWS CLI if not already:
winget install Amazon.AWSCLI

# 2. Configure credentials:
aws configure
# Enter your AWS Access Key ID
# Enter your Secret Access Key
# Region: us-east-1 (or your preferred region)

# 3. Create security group (one-time setup):
aws ec2 create-security-group \
  --group-name omniverse-sg \
  --description "Omniverse + Cosmos GPU instance"

# Note the GroupId (e.g., sg-0123456789abcdef0)

# 4. Allow SSH and HTTP/HTTPS:
aws ec2 authorize-security-group-ingress \
  --group-name omniverse-sg \
  --protocol tcp --port 22 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-name omniverse-sg \
  --protocol tcp --port 8000-8100 --cidr 0.0.0.0/0

# 5. Create key pair (if you don't have one):
aws ec2 create-key-pair \
  --key-name omniverse-key \
  --query 'KeyMaterial' \
  --output text > omniverse-key.pem

# 6. Launch instance:
aws ec2 run-instances \
  --image-id ami-0c7217cdde317cfec \
  --instance-type g5.xlarge \
  --key-name omniverse-key \
  --security-groups omniverse-sg \
  --block-device-mappings DeviceName=/dev/sda1,Ebs={VolumeSize=500,VolumeType=gp3} \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=omniverse-render}]'
```

**Note the Instance ID** from output (e.g., `i-0123456789abcdef0`)

### Step 3: Get Instance IP & Connect (5 min)

```bash
# Get public IP:
aws ec2 describe-instances \
  --instance-ids i-YOUR_INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text

# Example output: 3.85.123.45

# SSH in (from PowerShell):
ssh -i omniverse-key.pem ubuntu@3.85.123.45
```

---

## Part 2: Install NVIDIA Drivers + CUDA (15 min)

Once connected to your EC2 instance:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install NVIDIA drivers (A10G needs 535+)
sudo apt install -y ubuntu-drivers-common
sudo ubuntu-drivers autoinstall

# Reboot to load drivers
sudo reboot

# (Reconnect after ~60 seconds)
ssh -i omniverse-key.pem ubuntu@3.85.123.45

# Verify GPU is detected:
nvidia-smi
# Should show: A10G with 24GB VRAM

# Install CUDA Toolkit 12.x
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update
sudo apt install -y cuda-toolkit-12-3

# Add to PATH
echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# Verify CUDA
nvcc --version
# Should show: CUDA 12.3
```

---

## Part 3: Install Omniverse (Headless) (20 min)

AWS instances don't have a desktop GUI, so we'll use **headless Kit SDK**.

```bash
# Install dependencies
sudo apt install -y \
  wget curl git \
  python3.10 python3-pip \
  libx11-6 libxext6 libxrender1 libxi6 \
  ffmpeg

# Create working directory
mkdir -p ~/omniverse && cd ~/omniverse

# Download Omniverse Kit SDK (headless)
# Note: As of Nov 2024, Kit SDK requires registration. Two options:

# Option A: Use Omniverse Launcher (requires NGC account):
wget https://install.launcher.omniverse.nvidia.com/installers/omniverse-launcher-linux.AppImage
chmod +x omniverse-launcher-linux.AppImage

# Install in headless mode (requires X11 forwarding or virtual display):
sudo apt install -y xvfb
Xvfb :99 -screen 0 1024x768x24 &
export DISPLAY=:99
./omniverse-launcher-linux.AppImage

# Option B: Direct Kit SDK download (if available from NGC):
# Visit: https://ngc.nvidia.com/catalog/containers/nvidia:omniverse-kit
# Pull the container instead:
```

### Easier Path: Use Omniverse Docker Container

```bash
# Install Docker + NVIDIA Container Toolkit
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt update
sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker

# Logout and log back in for docker group
exit
# (reconnect)

# Test GPU in Docker:
docker run --rm --gpus all nvidia/cuda:12.3.0-base-ubuntu22.04 nvidia-smi
# Should show your A10G

# Pull Omniverse Kit container (check NGC for latest):
docker login nvcr.io
# Username: $oauthtoken
# Password: <Your NGC API Key from https://ngc.nvidia.com/setup/api-key>

docker pull nvcr.io/nvidia/omniverse-kit:latest
```

### Create Render Script

```bash
# Create render script directory
mkdir -p ~/clappper-render && cd ~/clappper-render

# Create minimal USD scene (test.usda)
cat > test.usda << 'EOF'
#usda 1.0

def Xform "World"
{
    def Sphere "TestSphere"
    {
        double radius = 1.0
        float3 xformOp:translate = (0, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }

    def Camera "MainCamera"
    {
        float focalLength = 50
        float3 xformOp:translate = (0, 0, 5)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
}
EOF

# Create headless render script (render_kit.py)
cat > render_kit.py << 'EOF'
import carb
import omni.kit.app
from omni.kit.viewport.utility import get_active_viewport
import omni.replicator.core as rep

def render_scene(usd_path: str, output_path: str, frames: int = 90):
    """Headless render with Replicator"""
    
    # Open stage
    omni.usd.get_context().open_stage(usd_path)
    
    # Setup camera and render product
    camera = rep.create.camera(position=(0, 0, 5))
    rp = rep.create.render_product(camera, resolution=(1920, 1080))
    
    # Basic RGB writer
    writer = rep.WriterRegistry.get("BasicWriter")
    writer.initialize(output_dir=output_path, rgb=True)
    writer.attach([rp])
    
    # Render frames
    rep.orchestrator.run(num_frames=frames)
    
    print(f"Rendered {frames} frames to {output_path}")

if __name__ == "__main__":
    import sys
    render_scene(sys.argv[1], sys.argv[2], int(sys.argv[3]))
EOF

# Run render via Docker:
docker run --rm --gpus all \
  -v $(pwd):/workspace \
  nvcr.io/nvidia/omniverse-kit:latest \
  /workspace/render_kit.py /workspace/test.usda /workspace/output 90
```

**✅ Checkpoint (target):** Once Kit headless rendering is healthy, you should see rendered frames in `~/clappper-render/output/`. As of Nov 2025 in this project, Kit container startup is **partially blocked** by extension registry issues (`omni.pip.compute` and offline index). Headless Omniverse remains a stretch goal while Cosmos + pipeline integration proceeds.

---

## Part 3b: Omniverse UI on Windows EC2 (Optional but Recommended)

For interactive scene authoring, use a separate **Windows g5.xlarge** instance with RDP and Omniverse Launcher. The Ubuntu instance remains the headless render/Cosmos engine.

### Step 1: Launch Windows g5.xlarge via AWS CLI (from your laptop)

```powershell
# 1. Open RDP port on existing security group (dev-friendly; tighten CIDR later)
aws ec2 authorize-security-group-ingress `
  --group-name clappper-omniverse-sg `
  --protocol tcp --port 3389 --cidr 0.0.0.0/0

# 2. Get latest Windows Server 2022 AMI in us-east-1
$WinAmi = aws ssm get-parameters `
  --names /aws/service/ami-windows-latest/Windows_Server-2022-English-Full-Base `
  --query 'Parameters[0].Value' `
  --output text

# 3. Launch Windows g5.xlarge
$WinInstance = aws ec2 run-instances `
  --image-id $WinAmi `
  --instance-type g5.xlarge `
  --key-name clappper-omniverse-key2 `
  --security-groups clappper-omniverse-sg `
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=200,VolumeType=gp3}" `
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=omniverse-win}]'

$WinInstanceId = ($WinInstance | ConvertFrom-Json).Instances[0].InstanceId

# 4. Get public IP
$WinPublicIp = aws ec2 describe-instances `
  --instance-ids $WinInstanceId `
  --query 'Reservations[0].Instances[0].PublicIpAddress' `
  --output text

# 5. Decrypt Windows Administrator password
aws ec2 get-password-data `
  --instance-id $WinInstanceId `
  --priv-launch-key "$HOME\.ssh\clappper-omniverse-key2.pem" `
  --query 'PasswordData' `
  --output text
```

### Step 2: RDP into Windows and Install GPU Driver

1. Open **Remote Desktop Connection** on your laptop and connect to `$WinPublicIp` as `Administrator` using the decrypted password.
2. In the Windows session, open a browser and go to `https://www.nvidia.com/Download/index.aspx`.
3. Download and install the latest **NVIDIA Data Center driver** for **NVIDIA A10** on **Windows Server 2022** (Express install).
4. Reboot the instance, RDP back in, open PowerShell, and verify:
   ```powershell
   nvidia-smi
   ```
   You should see the A10G listed.

### Step 3: Install Omniverse Launcher for Windows

1. In the Windows RDP session, open Edge and visit `https://ngc.nvidia.com` (sign in with the entitled NVIDIA account).
2. Download **NVIDIA Omniverse Launcher for Windows** from the Omniverse/Downloads section.
3. Run the Launcher installer and sign in.
4. From Launcher, install apps such as **Omniverse Composer** and **Omniverse Code** for interactive scene authoring.

### Suggested Workflow

- Use the **Windows Omniverse instance** for:
  - Building and editing scenes with full GUI.
  - Exporting USD scenes to a shared location (S3 or SCP to the Ubuntu instance).
- Use the **Ubuntu headless instance** for:
  - Automated Kit renders (once headless issues are resolved).
  - Generating control signals (depth/seg) for Cosmos.
  - Serving API endpoints to the Clappper web app.

---

## Part 4: Install Cosmos (25 min)

### Option A: Hosted API (Fastest)

```bash
# Install Python dependencies
pip3 install requests python-dotenv

# Set NGC API key
echo "NGC_API_KEY=nvapi-YOUR_KEY_HERE" > ~/.env

# Test Cosmos API availability
cat > test_cosmos_api.py << 'EOF'
import requests
import os
from dotenv import load_dotenv

load_dotenv()

NGC_API_KEY = os.getenv("NGC_API_KEY")

# List available NVCF functions
url = "https://api.nvcf.nvidia.com/v2/nvcf/functions"
headers = {
    "Authorization": f"Bearer {NGC_API_KEY}",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
print("Status:", response.status_code)
print("Available functions:")
for func in response.json().get("functions", []):
    if "cosmos" in func.get("name", "").lower():
        print(f"  - {func['name']}: {func.get('id')}")
EOF

python3 test_cosmos_api.py
```

If Cosmos models appear, you're good to go with hosted API.

### Option B: Self-Hosted NIM (if Cosmos available)

```bash
# Pull Cosmos NIM container (check NGC catalog for actual name)
docker pull nvcr.io/nvidia/cosmos-transfer:latest

# Run locally:
docker run -d --gpus all \
  --name cosmos-nim \
  -p 8000:8000 \
  -e NGC_API_KEY=$NGC_API_KEY \
  -v $(pwd)/cosmos-cache:/cache \
  nvcr.io/nvidia/cosmos-transfer:latest

# Test local endpoint:
curl -X POST http://localhost:8000/v1/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "controls": {"segmentation": "base64_encoded_image"},
    "duration": 3,
    "fps": 24
  }'
```

### Option C: Open-Source Weights (if NIMs unavailable)

```bash
# Clone Cosmos Transfer repo
cd ~/
git clone https://github.com/nvidia-cosmos/cosmos-transfer1.git
cd cosmos-transfer1

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Download model weights
# (Check repo README for weight links - typically from Hugging Face)
huggingface-cli login  # If needed
huggingface-cli download nvidia/cosmos-transfer1-v1 --local-dir ./weights

# Test inference
python inference.py \
  --seg-path example_seg.png \
  --depth-path example_depth.exr \
  --output output.mp4 \
  --duration 3
```

**✅ Checkpoint:** Cosmos should now be accessible (API, NIM, or local)

---

## Part 5: Wire into Clappper Pipeline (15 min)

### Setup Remote Development

From your **local Windows machine**:

```powershell
# Install VS Code Remote SSH extension (if not already)
code --install-extension ms-vscode-remote.remote-ssh

# Add your EC2 instance to SSH config:
notepad $HOME\.ssh\config

# Add these lines:
Host omniverse-aws
    HostName 3.85.123.45  # Your EC2 IP
    User ubuntu
    IdentityFile C:\path\to\omniverse-key.pem
```

Now in VS Code:
- `Ctrl+Shift+P` → "Remote-SSH: Connect to Host"
- Select `omniverse-aws`
- Open folder: `/home/ubuntu/clappper-render`

### Create Provider Wrappers

On the EC2 instance, create:

**`~/clappper-render/omniverse_provider.sh`:**

```bash
#!/bin/bash
# Usage: ./omniverse_provider.sh scene.usda output_dir frames

USD_PATH=$1
OUTPUT_DIR=$2
FRAMES=${3:-90}

docker run --rm --gpus all \
  -v $(pwd):/workspace \
  nvcr.io/nvidia/omniverse-kit:latest \
  python /workspace/render_kit.py \
  /workspace/$USD_PATH \
  /workspace/$OUTPUT_DIR \
  $FRAMES

echo "Omniverse render complete: $OUTPUT_DIR"
```

**`~/clappper-render/cosmos_provider.py`:**

```python
#!/usr/bin/env python3
import sys
import json
import requests
import os
from dotenv import load_dotenv

load_dotenv()

def cosmos_transfer(controls_json: str, output_path: str):
    """Call Cosmos Transfer API or local NIM"""
    
    NGC_API_KEY = os.getenv("NGC_API_KEY")
    COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT", "http://localhost:8000/v1/transfer")
    
    controls = json.loads(controls_json)
    
    payload = {
        "controls": controls,
        "duration": 3,
        "fps": 24
    }
    
    # If using hosted API:
    if "nvcf.nvidia.com" in COSMOS_ENDPOINT:
        headers = {"Authorization": f"Bearer {NGC_API_KEY}"}
    else:
        headers = {}
    
    response = requests.post(COSMOS_ENDPOINT, json=payload, headers=headers)
    result = response.json()
    
    # Download video (implementation depends on API response structure)
    video_url = result.get("output_url") or result.get("video")
    
    if video_url:
        video_data = requests.get(video_url).content
        with open(output_path, 'wb') as f:
            f.write(video_data)
        print(f"Cosmos output saved: {output_path}")
    else:
        print("Error: No video in response", result)

if __name__ == "__main__":
    cosmos_transfer(sys.argv[1], sys.argv[2])
```

Make executable:

```bash
chmod +x ~/clappper-render/omniverse_provider.sh
chmod +x ~/clappper-render/cosmos_provider.py
```

### Test End-to-End

```bash
cd ~/clappper-render

# 1. Render with Omniverse → get depth/seg
./omniverse_provider.sh test.usda output_omni 90

# 2. Feed to Cosmos (if available)
python3 cosmos_provider.py \
  '{"segmentation":"output_omni/seg_0001.png","depth":"output_omni/depth_0001.exr"}' \
  cosmos_output.mp4

# 3. Verify outputs
ls -lh output_omni/ cosmos_output.mp4
```

---

## Part 6: Connect to Web App (Your Local Machine)

### Option A: API Wrapper on EC2

On EC2, create a simple Flask API:

```bash
pip3 install flask flask-cors

cat > render_api.py << 'EOF'
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import subprocess
import uuid
import os

app = Flask(__name__)
CORS(app)

@app.route('/render/omniverse', methods=['POST'])
def render_omniverse():
    data = request.json
    job_id = str(uuid.uuid4())
    output_dir = f"jobs/{job_id}"
    os.makedirs(output_dir, exist_ok=True)
    
    # Save USD scene from request
    usd_path = f"{output_dir}/scene.usda"
    with open(usd_path, 'w') as f:
        f.write(data['usd_content'])
    
    # Render
    subprocess.run([
        './omniverse_provider.sh',
        usd_path,
        output_dir,
        str(data.get('frames', 90))
    ])
    
    return jsonify({"job_id": job_id, "output_dir": output_dir})

@app.route('/render/cosmos', methods=['POST'])
def render_cosmos():
    data = request.json
    job_id = str(uuid.uuid4())
    output_path = f"jobs/{job_id}/cosmos.mp4"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    subprocess.run([
        'python3', 'cosmos_provider.py',
        data['controls'],
        output_path
    ])
    
    return send_file(output_path, mimetype='video/mp4')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
EOF

# Run API server (in tmux/screen for persistence):
tmux new -s render-api
python3 render_api.py
# Detach: Ctrl+B, then D
```

### Option B: Direct SSH from Next.js API Routes

In your Next.js API route, call EC2 directly:

```typescript
// /api/render/omniverse
import { spawn } from 'child_process';

export async function POST(req: Request) {
  const { sceneRecipe } = await req.json();
  
  return new Promise((resolve, reject) => {
    const ssh = spawn('ssh', [
      '-i', process.env.AWS_KEY_PATH,
      `ubuntu@${process.env.EC2_IP}`,
      `cd ~/clappper-render && ./omniverse_provider.sh ${sceneRecipe.usd} output ${sceneRecipe.frames}`
    ]);
    
    ssh.on('close', (code) => {
      if (code === 0) {
        // SCP the results back or upload to S3
        resolve({ success: true, outputPath: 'output' });
      } else {
        reject(new Error(`Render failed: ${code}`));
      }
    });
  });
}
```

---

## Cost Management & Shutdown

### Stop Instance When Not Rendering

```bash
# From local machine:
aws ec2 stop-instances --instance-ids i-YOUR_INSTANCE_ID

# Start when needed:
aws ec2 start-instances --instance-ids i-YOUR_INSTANCE_ID

# Note: Public IP changes on restart; use Elastic IP if you need stable address
```

### Auto-Shutdown via CloudWatch + Lambda (Idle ~30 Minutes)

For both the Ubuntu headless instance and the Windows Omniverse UI instance, prefer AWS-native auto-stop instead of in-VM cron scripts.

High-level design:
- A **CloudWatch alarm** watches `CPUUtilization` on each instance.
- If average CPU < 1% for 30 minutes, the alarm triggers a **Lambda function**.
- Lambda calls `ec2:StopInstances` on the idle instance.

#### Step 1: Create IAM Role for Lambda

1. In the AWS console → **IAM → Roles → Create role**.
2. Trusted entity: **AWS service**, use case **Lambda**.
3. Attach the managed policy **`AmazonEC2FullAccess`** (or a tighter custom policy allowing `DescribeInstances` + `StopInstances`).
4. Name the role `clappper-ec2-autostop-role`.

#### Step 2: Create the Auto-Stop Lambda Function

Use Python 3.x runtime and the IAM role above.

Handler code (pseudo-code; store instance IDs as environment variables):

```python
import os
import boto3

ec2 = boto3.client("ec2")

def lambda_handler(event, context):
    instance_ids = []

    # One Lambda can stop multiple instances; use env vars for clarity.
    ubuntu_id = os.getenv("UBUNTU_INSTANCE_ID")
    win_id = os.getenv("WIN_INSTANCE_ID")

    if ubuntu_id:
        instance_ids.append(ubuntu_id)
    if win_id:
        instance_ids.append(win_id)

    if not instance_ids:
        return {"status": "no instances configured"}

    ec2.stop_instances(InstanceIds=instance_ids)
    return {"status": "stopped", "instances": instance_ids}
```

Set environment variables:
- `UBUNTU_INSTANCE_ID = i-...` (your headless EC2 ID)
- `WIN_INSTANCE_ID = i-...` (your Windows UI EC2 ID)

#### Step 3: Create CloudWatch Alarms for Each Instance

For both instances:

1. Go to **CloudWatch → Alarms → All alarms → Create alarm**.
2. Select metric: **EC2 → Per-Instance Metrics → CPUUtilization** for the instance.
3. Period: **5 minutes**, **Statistic: Average**.
4. Threshold: **`CPUUtilization < 1`** for **6 consecutive periods** (≈30 minutes).
5. Alarm action: **“Select an existing Lambda function”** → choose the auto-stop Lambda.
6. Name alarms:
   - `clappper-ubuntu-autostop`
   - `clappper-windows-autostop`

Once both alarms are `OK` → `ALARM` after 30 min of low CPU, Lambda will automatically stop the instances.

### Monthly Cost Estimates

**On-Demand g5.xlarge (~$1/hr):**
- 8 hours/day dev work: ~$240/month
- 2 hours/day rendering: ~$60/month

**Savings:**
- Use **Spot Instances** (60-70% cheaper) for batch rendering
- Stop instance overnight (save ~$360/month)
- Use **Reserved Instances** if you know you'll use it >1 year

### Alternative: AWS SageMaker Studio Lab (Free Tier)

If budget is tight:
- 15GB storage, 16GB RAM, Tesla T4 GPU
- Free tier available for approved projects
- Limited to 4-hour sessions

---

## Verification Checklist

### Omniverse ✅
- [ ] EC2 g5.xlarge launched & accessible
- [ ] NVIDIA drivers installed (`nvidia-smi` works)
- [ ] Docker + NVIDIA runtime working
- [ ] Omniverse Kit container renders test scene
- [ ] Can export depth/seg via Replicator

### Cosmos ✅
- [ ] NGC API key obtained
- [ ] Cosmos API accessible OR NIM running OR open weights inference works
- [ ] Test request completes (even if limited by quota)

### Integration ✅
- [ ] SSH/SCP from local machine works
- [ ] Can trigger remote render from web app
- [ ] Rendered outputs transfer back or upload to S3

---

## Troubleshooting

### "Docker: Error response from daemon: could not select device driver"
```bash
sudo systemctl restart docker
docker run --rm --gpus all nvidia/cuda:12.3.0-base-ubuntu22.04 nvidia-smi
```

### "Omniverse Kit container fails with 'No display'"
- Use Xvfb wrapper or Kit headless mode (already in scripts above)

### "Cosmos API returns 403"
- Check NGC key scope: needs "NVCF Invoke Function" permission
- Some models are in early access; join waitlist at developer.nvidia.com

### SSH Connection Drops
```bash
# Add to ~/.ssh/config on local machine:
Host omniverse-aws
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

---

## Next Steps

1. **Create test renders** (Omniverse → Cosmos pipeline)
2. **Benchmark costs** (track actual $/minute of video)
3. **Automate startup/shutdown** (AWS Lambda or cron to stop idle instances)
4. **Add to web app** (remote provider integration)
5. **Document in project README** (IP, credentials, commands)

**Realistic Setup Time:**
- EC2 + Drivers: 30 min
- Omniverse Docker: 20 min
- Cosmos setup: 30 min (if API) / 2 hours (if building)
- Integration: 20 min

**Total: 90-150 minutes**

---

## Cost-Saving Pro Tips

1. **Use spot instances** for batch rendering (save 60-70%)
2. **Snapshot your configured instance** → launch from AMI next time (skip setup)
3. **S3 for storage** → cheaper than EBS for rendered outputs ($0.023/GB vs $0.10/GB)
4. **Auto-shutdown script:**
   ```bash
   # Add to crontab: shutdown if idle >30 min
   */30 * * * * [ $(uptime | awk '{print $10}' | cut -d, -f1) -lt 0.1 ] && sudo shutdown -h now
   ```

Good luck! Let me know when you hit your first successful render.

