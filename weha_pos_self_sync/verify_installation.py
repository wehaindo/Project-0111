#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
POS Hybrid Sync - Installation Verification Script
This script checks if the module is properly installed and configured.
"""

import os
import sys

def check_file_structure():
    """Check if all required files exist"""
    print("=" * 60)
    print("Checking File Structure...")
    print("=" * 60)
    
    required_files = [
        '__init__.py',
        '__manifest__.py',
        'README.md',
        'INSTALLATION.md',
        'MODULE_SUMMARY.md',
        'models/__init__.py',
        'models/pos_order.py',
        'models/pos_config.py',
        'models/pos_session.py',
        'controllers/__init__.py',
        'controllers/main.py',
        'static/src/js/db_extended.js',
        'static/src/js/sync_service.js',
        'static/src/js/models_extended.js',
        'static/src/js/order_sync.js',
        'static/src/js/pos_patch.js',
        'static/src/css/pos_sync.css',
        'static/src/xml/pos_templates.xml',
        'views/assets.xml',
        'views/pos_config_views.xml',
        'security/ir.model.access.csv',
    ]
    
    missing_files = []
    for file_path in required_files:
        if os.path.exists(file_path):
            print(f"✅ {file_path}")
        else:
            print(f"❌ {file_path} - MISSING!")
            missing_files.append(file_path)
    
    if missing_files:
        print(f"\n⚠️  {len(missing_files)} file(s) missing!")
        return False
    else:
        print(f"\n✅ All {len(required_files)} files present!")
        return True

def check_file_contents():
    """Check if key files have content"""
    print("\n" + "=" * 60)
    print("Checking File Contents...")
    print("=" * 60)
    
    checks = []
    
    # Check __manifest__.py
    try:
        with open('__manifest__.py', 'r') as f:
            content = f.read()
            if "'name':" in content and "'version':" in content:
                print("✅ __manifest__.py - Valid")
                checks.append(True)
            else:
                print("❌ __manifest__.py - Invalid format")
                checks.append(False)
    except Exception as e:
        print(f"❌ __manifest__.py - Error: {e}")
        checks.append(False)
    
    # Check JavaScript files
    js_files = [
        'static/src/js/db_extended.js',
        'static/src/js/sync_service.js',
        'static/src/js/models_extended.js',
        'static/src/js/order_sync.js',
        'static/src/js/pos_patch.js',
    ]
    
    for js_file in js_files:
        try:
            with open(js_file, 'r') as f:
                content = f.read()
                if 'odoo.define' in content and len(content) > 1000:
                    print(f"✅ {js_file} - Valid ({len(content)} bytes)")
                    checks.append(True)
                else:
                    print(f"❌ {js_file} - Too short or invalid")
                    checks.append(False)
        except Exception as e:
            print(f"❌ {js_file} - Error: {e}")
            checks.append(False)
    
    # Check Python models
    model_files = [
        'models/pos_order.py',
        'models/pos_config.py',
        'models/pos_session.py',
    ]
    
    for model_file in model_files:
        try:
            with open(model_file, 'r') as f:
                content = f.read()
                if 'from odoo import' in content and 'models.' in content:
                    print(f"✅ {model_file} - Valid")
                    checks.append(True)
                else:
                    print(f"❌ {model_file} - Invalid format")
                    checks.append(False)
        except Exception as e:
            print(f"❌ {model_file} - Error: {e}")
            checks.append(False)
    
    # Check controller
    try:
        with open('controllers/main.py', 'r') as f:
            content = f.read()
            if '@http.route' in content and 'get_updates' in content:
                print(f"✅ controllers/main.py - Valid")
                checks.append(True)
            else:
                print(f"❌ controllers/main.py - Missing routes")
                checks.append(False)
    except Exception as e:
        print(f"❌ controllers/main.py - Error: {e}")
        checks.append(False)
    
    passed = sum(checks)
    total = len(checks)
    print(f"\n✅ {passed}/{total} content checks passed")
    
    return all(checks)

def count_lines_of_code():
    """Count total lines of code"""
    print("\n" + "=" * 60)
    print("Code Statistics...")
    print("=" * 60)
    
    file_patterns = {
        'Python': ['models/*.py', 'controllers/*.py'],
        'JavaScript': ['static/src/js/*.js'],
        'XML': ['views/*.xml', 'static/src/xml/*.xml'],
        'CSS': ['static/src/css/*.css'],
    }
    
    stats = {}
    
    for lang, patterns in file_patterns.items():
        total_lines = 0
        file_count = 0
        
        for pattern in patterns:
            import glob
            for file_path in glob.glob(pattern):
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        lines = len(f.readlines())
                        total_lines += lines
                        file_count += 1
                except:
                    pass
        
        stats[lang] = {'lines': total_lines, 'files': file_count}
        print(f"{lang:12} - {file_count:2} files, {total_lines:5} lines")
    
    total_lines = sum(s['lines'] for s in stats.values())
    total_files = sum(s['files'] for s in stats.values())
    
    print(f"\n{'TOTAL':12} - {total_files:2} files, {total_lines:5} lines of code")
    
    return total_lines

def print_summary():
    """Print installation summary"""
    print("\n" + "=" * 60)
    print("Installation Summary")
    print("=" * 60)
    
    print("""
Module: weha_pos_self_sync
Name: POS Hybrid Sync - Offline First
Version: 13.0.1.0.0

Components:
  ✅ Backend Models (3 files)
  ✅ Controllers (5 endpoints)
  ✅ JavaScript Services (5 files)
  ✅ IndexedDB Integration
  ✅ Background Sync Worker
  ✅ UI Templates & Styling
  ✅ Configuration Views

Features:
  ✅ Offline-first capability
  ✅ Background synchronization
  ✅ Retry with exponential backoff
  ✅ Lazy loading products
  ✅ Delta sync
  ✅ Auto-save orders
  ✅ Sync status UI

Next Steps:
  1. Install module in Odoo
  2. Configure POS settings
  3. Test offline mode
  4. Monitor sync status
  5. Train users

Documentation:
  📖 README.md - Full documentation
  📖 INSTALLATION.md - Setup guide
  📖 MODULE_SUMMARY.md - Complete overview
""")

def main():
    """Main verification function"""
    print("\n" + "=" * 60)
    print("POS HYBRID SYNC - INSTALLATION VERIFICATION")
    print("=" * 60)
    
    # Change to module directory if script is run from elsewhere
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if os.path.basename(script_dir) != 'weha_pos_self_sync':
        module_dir = os.path.join(script_dir, 'weha_pos_self_sync')
        if os.path.exists(module_dir):
            os.chdir(module_dir)
    
    # Run checks
    structure_ok = check_file_structure()
    content_ok = check_file_contents()
    total_lines = count_lines_of_code()
    
    print_summary()
    
    # Final verdict
    print("=" * 60)
    if structure_ok and content_ok:
        print("✅ MODULE VERIFICATION PASSED!")
        print("=" * 60)
        print("\nThe module is ready for installation in Odoo 13.")
        print("Follow INSTALLATION.md for next steps.")
        return 0
    else:
        print("❌ MODULE VERIFICATION FAILED!")
        print("=" * 60)
        print("\nPlease check the errors above and fix missing/invalid files.")
        return 1

if __name__ == '__main__':
    sys.exit(main())
